const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// M-Pesa Configuration
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || 'QwzCGC1fTPluVAXeNjxFTTDXsjklVKeL';
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || '6Uc2GeVcZBUGWHGT';
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || '000772';
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || 'b309881157d87125c7f87ffffde6448ab10f90e3dce7c4d8efab190482896018';
const MPESA_API_URL = 'https://api.safaricom.co.ke';

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vnlevzndmktifkkdnrns.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Get M-Pesa OAuth Access Token
 */
async function getAccessToken() {
  const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
  
  const response = await fetch(`${MPESA_API_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Generate M-Pesa Password
 */
function generatePassword() {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');
  return { password, timestamp };
}

/**
 * Format phone number to M-Pesa format (254XXXXXXXXX)
 */
function formatPhoneNumber(phone) {
  let cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.slice(1);
  } else if (cleaned.startsWith('+254')) {
    cleaned = cleaned.slice(1);
  } else if (!cleaned.startsWith('254')) {
    cleaned = '254' + cleaned;
  }
  
  return cleaned;
}

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'M-Pesa Proxy Server',
    version: '2.0.0',
    endpoints: {
      stkpush: 'POST /stkpush',
      callback: 'POST /callback',
      health: 'GET /',
    },
  });
});

/**
 * STK Push Endpoint
 */
app.post('/stkpush', async (req, res) => {
  try {
    const { phone, amount, userId } = req.body;

    // Validate request
    if (!phone || !amount || !userId) {
      return res.status(400).json({
        success: false,
        error: 'phone, amount, and userId are required',
      });
    }

    // Get M-Pesa access token
    const accessToken = await getAccessToken();
    const { password, timestamp } = generatePassword();
    const phoneNumber = formatPhoneNumber(phone);
    
    // Get callback URL
    const callbackUrl = process.env.CALLBACK_URL || `${req.protocol}://${req.get('host')}/callback`;

    // Create pending M-Pesa transaction in database
    const merchantRequestId = `MR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const checkoutRequestId = `CR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const { data: tx, error: txError } = await supabase
      .from('mpesa_transactions')
      .insert({
        user_id: userId,
        merchant_request_id: merchantRequestId,
        checkout_request_id: checkoutRequestId,
        phone_number: phoneNumber,
        amount: parseFloat(amount),
        account_reference: `DEPOSIT-${userId.slice(0, 8)}`,
        transaction_desc: 'Wallet Deposit',
        status: 'pending',
      })
      .select()
      .single();

    if (txError) {
      console.error('Database error:', txError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create transaction',
        details: txError.message,
      });
    }

    // Initiate STK Push
    const stkPayload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: phoneNumber,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl,
      AccountReference: tx.account_reference,
      TransactionDesc: 'Wallet Deposit',
    };

    console.log('STK Push Request:', { ...stkPayload, Password: '***' });

    const stkResponse = await fetch(`${MPESA_API_URL}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stkPayload),
    });

    const stkData = await stkResponse.json();
    console.log('STK Push Response:', stkData);

    if (!stkResponse.ok || stkData.ResponseCode !== '0') {
      // Delete the pending transaction since STK Push failed
      await supabase
        .from('mpesa_transactions')
        .delete()
        .eq('id', tx.id);

      return res.status(400).json({
        success: false,
        error: stkData.errorMessage || stkData.ResponseDescription || 'STK Push failed',
      });
    }

    // Update transaction with actual M-Pesa IDs
    await supabase
      .from('mpesa_transactions')
      .update({
        merchant_request_id: stkData.MerchantRequestID,
        checkout_request_id: stkData.CheckoutRequestID,
      })
      .eq('id', tx.id);

    res.json({
      success: true,
      message: 'STK Push sent successfully',
      checkoutRequestId: stkData.CheckoutRequestID,
      merchantRequestId: stkData.MerchantRequestID,
    });

  } catch (error) {
    console.error('STK Push error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * M-Pesa Callback Endpoint
 */
app.post('/callback', async (req, res) => {
  try {
    const { Body } = req.body;
    const { stkCallback } = Body || {};

    if (!stkCallback) {
      return res.json({ ResultCode: 0, ResultDesc: 'Invalid callback' });
    }

    console.log('M-Pesa Callback:', stkCallback);

    const checkoutId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;

    // Get M-Pesa transaction
    const { data: mpesaTx } = await supabase
      .from('mpesa_transactions')
      .select('*')
      .eq('checkout_request_id', checkoutId)
      .single();

    if (!mpesaTx) {
      console.error('M-Pesa transaction not found:', checkoutId);
      return res.json({ ResultCode: 0, ResultDesc: 'Transaction not found' });
    }

    // Check if already processed
    if (mpesaTx.status === 'completed') {
      return res.json({ ResultCode: 0, ResultDesc: 'Already processed' });
    }

    // Process successful payment
    if (resultCode === 0) {
      const receipt = stkCallback.CallbackMetadata?.Item?.find(
        (i) => i.Name === 'MpesaReceiptNumber'
      )?.Value || null;

      const transactionDate = stkCallback.CallbackMetadata?.Item?.find(
        (i) => i.Name === 'TransactionDate'
      )?.Value || null;

      // Update M-Pesa transaction
      await supabase
        .from('mpesa_transactions')
        .update({
          status: 'completed',
          mpesa_receipt_number: receipt,
          transaction_date: transactionDate,
          result_code: resultCode,
          result_desc: stkCallback.ResultDesc,
        })
        .eq('id', mpesaTx.id);

      // Credit wallet using the credit_wallet function
      const { error: creditError } = await supabase.rpc('credit_wallet', {
        p_user_id: mpesaTx.user_id,
        p_amount: mpesaTx.amount,
        p_transaction_type: 'deposit',
        p_description: `M-Pesa deposit - ${receipt}`,
        p_reference: receipt,
      });

      if (creditError) {
        console.error('Failed to credit wallet:', creditError);
        return res.json({ ResultCode: 1, ResultDesc: 'Failed to credit wallet' });
      }

      console.log(`Wallet credited: ${mpesaTx.amount} KES for user ${mpesaTx.user_id}`);
    } else {
      // Failed payment
      await supabase
        .from('mpesa_transactions')
        .update({
          status: 'failed',
          result_code: resultCode,
          result_desc: stkCallback.ResultDesc,
        })
        .eq('id', mpesaTx.id);

      console.log(`Payment failed for transaction ${mpesaTx.id}: ${stkCallback.ResultDesc}`);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (error) {
    console.error('Callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`M-Pesa Proxy Server running on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  - POST /stkpush - Initiate STK Push`);
  console.log(`  - POST /callback - M-Pesa callback`);
  console.log(`  - GET / - Health check`);
});
