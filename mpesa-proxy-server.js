# UPDATE GITHUB REPO - STEP BY STEP 📝

## 🎯 GOAL
Update the mpesa-proxy-server.js file on GitHub so Render can redeploy with the fixed code.

---

## 📋 EXACT STEPS

### Step 1: Open GitHub Repo
Go to: **https://github.com/ruthnabalayokhisa536-ui/mpesa-proxy-server**

### Step 2: Click on the File
Click on **`mpesa-proxy-server.js`** in the file list

### Step 3: Edit the File
Click the **pencil icon** (✏️) in the top right corner that says "Edit this file"

### Step 4: Delete Old Content
- Press `Ctrl+A` (Windows) or `Cmd+A` (Mac) to select all
- Press `Delete` to remove all content

### Step 5: Copy New Content
- Open the file **`COPY_THIS_TO_GITHUB.js`** in your project
- Press `Ctrl+A` (Windows) or `Cmd+A` (Mac) to select all
- Press `Ctrl+C` (Windows) or `Cmd+C` (Mac) to copy

### Step 6: Paste New Content
- Go back to GitHub editor
- Press `Ctrl+V` (Windows) or `Cmd+V` (Mac) to paste

### Step 7: Commit Changes
- Scroll down to "Commit changes" section
- In the commit message box, type: `Fix schema to use mpesa_transactions table`
- Click the green **"Commit changes"** button

### Step 8: Wait for Render to Deploy
- Go to: https://dashboard.render.com
- Click on your `mpesa-proxy` service
- You'll see "Deploying..." status
- Wait ~1 minute until it shows "Live"

### Step 9: Test M-Pesa
- Open: https://abanremit-wallet.lovable.app
- Login
- Go to Deposit page
- Select M-Pesa
- Enter phone and amount
- Click Deposit
- Check your phone for STK Push!

---

## ✅ WHAT THE FIX DOES

### Before (Old Code - 400 Error):
```javascript
// Tried to use wrong table and columns
const { phone, amount, walletId, userId } = req.body;
await supabase.from('transactions').insert({
  wallet_id: walletId,  // ❌ Column doesn't exist
  ...
})
```

### After (New Code - Works!):
```javascript
// Uses correct table and schema
const { phone, amount, userId } = req.body;
await supabase.from('mpesa_transactions').insert({
  user_id: userId,  // ✅ Correct schema
  merchant_request_id: merchantRequestId,
  checkout_request_id: checkoutRequestId,
  phone_number: phoneNumber,
  amount: amount,
  ...
})
```

---

## 🔍 HOW TO VERIFY IT WORKED

### Check Render Logs:
After deployment, you should see:
```
M-Pesa Proxy Server running on port 10000
Endpoints:
  - POST /stkpush - Initiate STK Push
  - POST /callback - M-Pesa callback
  - GET / - Health check
```

### Test Deposit:
1. Try M-Pesa deposit in your app
2. Should NOT get 400 error anymore
3. Should get STK Push on phone
4. After entering PIN, wallet should be credited

---

## 🆘 IF YOU GET STUCK

### Can't find the pencil icon?
- Make sure you're logged into GitHub
- Make sure you're on YOUR repo (ruthnabalayokhisa536-ui/mpesa-proxy-server)
- The pencil icon is in the top right, next to "Raw" and "Blame"

### Commit button is grayed out?
- Make sure you actually changed the file content
- Try typing something in the commit message box

### Render not deploying?
- Check that the commit went through on GitHub
- Go to Render dashboard and check "Events" tab
- You can manually trigger deploy by clicking "Manual Deploy" → "Deploy latest commit"

---

## 📊 TIMELINE

1. **Now**: Update file on GitHub (2 minutes)
2. **+1 min**: Render starts deploying
3. **+2 min**: Render finishes deploying
4. **+3 min**: Test M-Pesa deposit
5. **+4 min**: Celebrate! 🎉

---

**DO THIS NOW!** The file `COPY_THIS_TO_GITHUB.js` has the exact code you need to paste.
