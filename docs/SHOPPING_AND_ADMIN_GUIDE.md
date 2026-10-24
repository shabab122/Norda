# Norda — search, guest shopping ও admin flow

এই guide **2.14.2 Local Final**-এর ব্যবহার বোঝায়। বর্তমান feature scope-এর মধ্যেই search, password visibility এবং order management পরিষ্কার করা হয়েছে। Database connection, existing credentials, catalog ও brand assets অপরিবর্তিত।

## Search ও password

- Header-এর search এখন একটি সম্পূর্ণ bordered control। খালি বা শুধু space থাকলে Search inactive থাকবে এবং কোনো page খুলবে না। Product, category বা brand লিখে Search/Enter দিলে filtered Shop page খুলবে। যেমন `Electronics`, `Fashion` বা কোনো product name।
- Password field-এর eye button দিয়ে শুধু সেই field-এর লেখা দেখা/লুকানো যায়। Sign-in, signup এবং পরে তৈরি হওয়া account password form-এও এটি কাজ করে। Eye button form submit করে না; page ছাড়লে password আবার hidden হয়।

## Guest হিসেবে shopping

1. Product/variant বেছে cart-এ যোগ করুন। Account তৈরি করা বাধ্যতামূলক নয়।
2. Checkout-এ নিজের নাম, **সঠিক order email**, delivery address ও payment method দিন।
3. COD order save হলে সরাসরি **Track your guest order** page খুলবে। Online/simulated payment-এর ক্ষেত্রে payment outcome শেষে order history দেখা যায়।
4. Full **Order ID** ও checkout email সংরক্ষণ করুন। Guest history-তে Invoice ও **Track delivery** আছে।
5. Store staff order update করলে **Refresh orders / Refresh delivery** দিয়ে সর্বশেষ অবস্থা দেখুন।

Guest order database-এ সংরক্ষিত থাকে। এই browser-এর private cookie সর্বোচ্চ ৩০ দিন access রাখে। Cookie মুছে গেলে order মুছে যায় না। অন্য browser/device বা cookie expiry-এর পরে **Track order → Recover order access**-এ full Order ID ও checkout email দিন। Matching purchase-এর private recovery link সেই email-এ পাঠানো হয়; link একবার ব্যবহারযোগ্য এবং এক ঘণ্টা valid। Email-এ আসা link খুলে **Open my guest orders** চাপুন। বাস্তবে email পেতে store-এর working SMTP settings প্রয়োজন; local preview mode নিজে inbox delivery করে না।

একটি recovery link মূল guest shopping identity-এর order history খুলে দেয়। অন্য browser-এ আলাদাভাবে করা guest purchase recover করতে সেই purchase-এর Order ID ব্যবহার করুন। অনুমান করা Order ID বা email দিয়ে private order দেখা যায় না।

## Order-এর stages কে বদলাবে?

| Stage | Store-এর কাজ | Customer কী দেখবে |
|---|---|---|
| Pending / Order placed | Order গ্রহণ, payment/stock যাচাই | Order ID, invoice ও initial progress |
| Processing / Preparing | Product প্রস্তুত করা | Preparing stage |
| Shipped | Courier name, tracking reference দিয়ে dispatch | Courier details, history ও tracking link থাকলে সেটি |
| Delivered | Actual delivery নিশ্চিত করা | Delivered stage; COD payment paid |
| Cancelled | Eligible cancellation ও stock/refund workflow | Cancellation status; refund আলাদাভাবে দেখায় |

Customer নিজে order-কে processing/shipped/delivered করতে পারে না। Store administrator বা Orders permission পাওয়া staff এই কাজ করে। Return, refund ও payment review-এর বিদ্যমান নিয়মও আগের মতো enforced থাকে।

## Admin কে এবং কোথায় sign in করবে?

**Public signup customer account তৈরি করে।** Signup করে কেউ নিজে admin হতে পারে না। আগের setup-এ তৈরি store admin account দিয়েই Sign in করুন, অথবা footer-এর **Store staff sign in** ব্যবহার করুন। Administrator ও staff তাদের permission অনুযায়ী workspace পায়।

প্রথম admin তৈরি না হয়ে থাকলে project owner server directory থেকে চালাতে পারেন:

```bash
cd server
npm run admin:ensure
```

Command existing private server configuration-এর `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` এবং working `MONGO_URI` পড়ে। এটি:

- Configured email-এ admin না থাকলে শুধু সেই admin account তৈরি করে।
- Existing admin পাওয়া গেলে তার password/name/permissions বদলায় না।
- ওই email customer/staff-এর হলে সেটিকে admin-এ promote করে না; error দেয়।
- Product, stock, order, catalog বা database credentials বদলায় না; catalog seed চালায় না।

New admin-এর password কমপক্ষে ১২ character এবং সর্বোচ্চ ৭২ UTF-8 byte হতে হবে। Existing admin থাকলে তার **বর্তমান** password ব্যবহার করুন; command সেটি reset করে না। প্রয়োজন হলে সাধারণ Forgot password flow ব্যবহার করুন। এখানে কোনো নতুন/default password প্রকাশ বা frontend-এ hardcode করা হয়নি।

## Admin কীভাবে guest ও account order process করবে?

1. Admin workspace-এর **Orders** খুলুন। Guest ও account order একই queue-তে আসে। Row-এ **Guest checkout / Account order**, actual customer contact ও phone দেখায়। নতুন order পেতে **Refresh orders** চাপুন।
2. Eligible Pending order-এ **Mark processing** দিন। Online unpaid/review order-এর আগের payment safeguards কার্যকর থাকবে।
3. Processing order-এ **Add courier & dispatch** বেছে নিলে Delivery tracking form খুলবে এবং Dispatch action selected থাকবে। Courier name/tracking number পূরণ করে save করুন। শুধু dropdown দিয়ে courier তথ্য ছাড়াই dispatch করার চেষ্টা করতে হবে না।
4. Delivery tracking থেকে প্রয়োজনমতো In transit/Out for delivery/Delivered update দিন। Delivered COD order-এর payment ও invoice status একসঙ্গে update হয়।
5. Cancellation, return/refund বা payment review-এর জন্য row-এর **Requests & payments** ব্যবহার করুন। Cancel/refund pending থাকলে fulfillment আগে এগোবে না।

Warehouse fulfillment চালু করা order-এ **Manage warehouse parcels** ব্যবহার করুন। প্রতিটি parcel-এর preparing, shipping ও delivery আলাদা record হয়; সব parcel পৌঁছালে order Delivered হয়। Customer tracking page-এও প্রতিটি parcel দেখা যায়। Active carrier API job থাকলে তার existing reconciliation/sync workflow ব্যবহার করুন।

## পরে account তৈরি করলে guest purchase কী হবে?

- একই browser-এর guest history Track order থেকে দেখা যায়। Signed in থাকলেও **Track delivery** ও guest Invoice private guest cookie ব্যবহার করে; account/cart identity বদলায় না।
- Account-এর order list-এ রাখতে চাইলে একই checkout email দিয়ে account তৈরি করুন, Profile থেকে email verify করুন, তারপর Guest orders page-এ **Link guest orders to my account** চাপুন। অন্য email-এর account-এ link করা যাবে না।
- Link হয়ে গেলে **My account orders** থেকে history ও requests manage করুন। আলাদা guest cart থাকলে existing merge action দিয়ে account cart-এ নেওয়া যায়।

## Local use

Normal startup আগের মতো:

```bash
cd server
npm ci
npm run verify
npm run dev
```

Open `http://localhost:5000`। একই browser-এ visit করার সময় একই hostname ব্যবহার করুন; localhost ও 127.0.0.1-এর cookie আলাদা হতে পারে। Working environment ও uploads অক্ষত রাখুন। GitStack/Gitea-এর 3000/3002 port ব্যবহার করা হয়নি।

See [README](../README.md), [run commands](../RUN_COMMANDS.md) ও [verification](VERIFICATION_RESULTS.md)। এখানে নতুন future-feature backlog বা production-hosting requirement যোগ করা হয়নি।
