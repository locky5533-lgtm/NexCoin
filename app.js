import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, set, get, update, child, onValue, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

window.addEventListener('load', () => {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;

    // Toast Notification
    window.showToast = (message, icon = "fa-circle-check") => {
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
        document.getElementById('toast-container').appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 50);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
    };

    // 1. Auth Logic
    const urlParams = new URLSearchParams(window.location.search);
    let inviteCode = urlParams.get('inviteCode') || "None";
    document.getElementById('refDisplay').innerText = inviteCode;

    document.getElementById('signupBtn').addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const newRefCode = user.uid.substring(0, 6).toUpperCase();

            await set(ref(db, 'users/' + user.uid), {
                email: user.email, balance: 0, lifetimeEarned: 0, referralEarnings: 0,
                referredBy: inviteCode !== "None" ? inviteCode : null,
                myRefCode: newRefCode, createdAt: new Date().toISOString(),
                streak: 0, lastCheckIn: null, tasks: { telegram: false, twitter: false, video: false }
            });

            if (inviteCode !== "None") {
                const dbRef = ref(db);
                const snapshot = await get(child(dbRef, `users`));
                if (snapshot.exists()) {
                    const users = snapshot.val();
                    let referrerId = null;
                    for (let uid in users) {
                        if (users[uid].myRefCode === inviteCode) { referrerId = uid; break; }
                    }
                    if (referrerId) {
                        const refData = users[referrerId];
                        await update(ref(db, 'users/' + referrerId), { 
                            balance: (refData.balance || 0) + 10,
                            lifetimeEarned: (refData.lifetimeEarned || 0) + 10,
                            referralEarnings: (refData.referralEarnings || 0) + 10
                        });
                    }
                }
            }
            window.showToast("Account created successfully!");
        } catch (error) { window.showToast(error.message, "fa-circle-exclamation"); }
    });

    document.getElementById('loginBtn').addEventListener('click', async () => {
        try { await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); } 
        catch (error) { window.showToast(error.message, "fa-circle-exclamation"); }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

    document.getElementById('copyBtn').addEventListener('click', () => {
        document.getElementById('refLink').select();
        document.execCommand('copy');
        window.showToast("Referral link copied!", "fa-clipboard-check");
    });

    // 2. Free Mining (0.001 NEX/sec)
    let miningInterval;
    let pendingNex = 0;

    document.getElementById('claimBtn').addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user || pendingNex <= 0) return;
        const userRef = ref(db, 'users/' + user.uid);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
            let currentBalance = parseFloat(snapshot.val().balance) || 0;
            let currentLife = parseFloat(snapshot.val().lifetimeEarned) || 0;
            let claimAmount = parseFloat(pendingNex.toFixed(4));
            await update(userRef, { balance: currentBalance + claimAmount, lifetimeEarned: currentLife + claimAmount });
            pendingNex = 0; 
            document.getElementById('pendingBalance').innerText = "0.0000 NEX";
            window.showToast(`Claimed ${claimAmount} NEX!`);
        }
    });

    // 3. Investment Logic
    document.querySelectorAll('.btn-invest').forEach(button => {
        button.addEventListener('click', async (e) => {
            const user = auth.currentUser;
            if (!user) return;
            const product = e.target.getAttribute('data-product');
            const roi = parseFloat(e.target.getAttribute('data-roi'));
            const cost = parseFloat(e.target.getAttribute('data-cost'));

            const userRef = ref(db, 'users/' + user.uid);
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                let currentBalance = parseFloat(snapshot.val().balance) || 0;
                if (currentBalance >= cost) {
                    await update(userRef, { balance: currentBalance - cost });
                    await set(ref(db, `users/${user.uid}/investments/${product}`), {
                        amount: cost, roi: roi, startTime: Date.now(), lastHarvest: Date.now()
                    });
                    window.showToast(`Invested in ${product}!`);
                } else { window.showToast(`Need ${cost} NEX to invest`, "fa-triangle-exclamation"); }
            }
        });
    });

    window.harvestYield = async (productName) => {
        const user = auth.currentUser;
        if (!user) return;
        const userRef = ref(db, 'users/' + user.uid);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
            const data = snapshot.val();
            const investment = data.investments?.[productName];
            if (!investment) return;
            const now = Date.now();
            const secondsPassed = (now - investment.lastHarvest) / 1000;
            const dailyYield = investment.amount * investment.roi;
            const earned = (dailyYield / 86400) * secondsPassed;

            if (earned > 0.001) {
                let earnedFixed = parseFloat(earned.toFixed(4));
                await update(userRef, { 
                    balance: (parseFloat(data.balance) || 0) + earnedFixed,
                    lifetimeEarned: (parseFloat(data.lifetimeEarned) || 0) + earnedFixed,
                    [`investments/${productName}/lastHarvest`]: now
                });
                window.showToast(`Harvested ${earnedFixed} NEX!`);
            } else { window.showToast("Not enough yield yet", "fa-hourglass-half"); }
        }
    };

    // 4. Daily Check-in Logic
    document.getElementById('checkinBtn').addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;
        const userRef = ref(db, 'users/' + user.uid);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
            const data = snapshot.val();
            const lastCheckIn = data.lastCheckIn;
            const today = new Date().toDateString();

            if (lastCheckIn === today) {
                window.showToast("Already checked in today!", "fa-circle-info");
                return;
            }

            // Calculate Streak
            let newStreak = 1;
            if (lastCheckIn) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                if (lastCheckIn === yesterday.toDateString()) {
                    newStreak = (data.streak || 0) + 1;
                }
            }
            if (newStreak > 7) newStreak = 7; // Max streak 7

            const reward = newStreak * 2; // Day 1=2, Day 2=4... Day 7=14
            await update(userRef, {
                streak: newStreak,
                lastCheckIn: today,
                balance: (parseFloat(data.balance) || 0) + reward,
                lifetimeEarned: (parseFloat(data.lifetimeEarned) || 0) + reward
            });
            window.showToast(`Checked in! Earned ${reward} NEX!`);
        }
    });

    // 5. Tasks Logic
    document.querySelectorAll('.btn-task').forEach(button => {
        button.addEventListener('click', async (e) => {
            const user = auth.currentUser;
            if (!user) return;
            const taskName = e.target.getAttribute('data-task');
            const reward = parseInt(e.target.getAttribute('data-reward'));

            const userRef = ref(db, 'users/' + user.uid);
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data.tasks && data.tasks[taskName]) {
                    window.showToast("Task already completed!", "fa-circle-info");
                    return;
                }

                // Open links for social tasks
                if (taskName === 'telegram') window.open('https://t.me/your_channel', '_blank');
                if (taskName === 'twitter') window.open('https://twitter.com/your_page', '_blank');

                await update(userRef, {
                    [`tasks/${taskName}`]: true,
                    balance: (parseFloat(data.balance) || 0) + reward,
                    lifetimeEarned: (parseFloat(data.lifetimeEarned) || 0) + reward
                });
                window.showToast(`Task completed! +${reward} NEX!`);
                e.target.innerText = "Done";
                e.target.disabled = true;
            }
        });
    });

    // 6. Withdrawal Logic
    document.getElementById('openWithdrawBtn').addEventListener('click', () => {
        document.getElementById('withdrawModal').style.display = 'flex';
    });
    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('withdrawModal').style.display = 'none';
    });

    document.getElementById('submitWithdraw').addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;
        const method = document.getElementById('withdrawMethod').value;
        const account = document.getElementById('withdrawAccount').value;
        const amount = parseFloat(document.getElementById('withdrawAmount').value);

        if (!account || !amount || amount < 100) {
            window.showToast("Min withdrawal is 100 NEX", "fa-triangle-exclamation");
            return;
        }

        const userRef = ref(db, 'users/' + user.uid);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
            let currentBalance = parseFloat(snapshot.val().balance) || 0;
            if (currentBalance >= amount) {
                // Deduct balance
                await update(userRef, { balance: currentBalance - amount });
                
                // Save withdrawal request to admin table
                const withdrawRef = ref(db, 'withdrawals');
                const newWithdrawRef = push(withdrawRef);
                await set(newWithdrawRef, {
                    userId: user.uid,
                    email: user.email,
                    method: method,
                    account: account,
                    amount: amount,
                    status: 'pending',
                    requestedAt: new Date().toISOString()
                });

                window.showToast("Withdrawal requested! Pending approval.");
                document.getElementById('withdrawModal').style.display = 'none';
                document.getElementById('withdrawAccount').value = '';
                document.getElementById('withdrawAmount').value = '';
            } else {
                window.showToast("Insufficient balance", "fa-triangle-exclamation");
            }
        }
    });

    // 7. Track Auth State
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';

            const userRef = ref(db, 'users/' + user.uid);
            onValue(userRef, (snapshot) => {
                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    document.getElementById('walletBalance').innerText = parseFloat(userData.balance || 0).toFixed(2);
                    document.getElementById('lifetimeEarned').innerText = `${parseFloat(userData.lifetimeEarned || 0).toFixed(2)} NEX`;
                    document.getElementById('referralEarnings').innerText = `${parseFloat(userData.referralEarnings || 0).toFixed(2)} NEX`;
                    document.getElementById('refLink').value = `https://locky5533-lgtm.github.io/NexCoin/?inviteCode=${userData.myRefCode}`;
                    document.getElementById('streakCount').innerText = userData.streak || 0;
                    
                    // Disable tasks if already done
                    if (userData.tasks) {
                        if (userData.tasks.telegram) { document.querySelector('[data-task="telegram"]').innerText = "Done"; document.querySelector('[data-task="telegram"]').disabled = true; }
                        if (userData.tasks.twitter) { document.querySelector('[data-task="twitter"]').innerText = "Done"; document.querySelector('[data-task="twitter"]').disabled = true; }
                        if (userData.tasks.video) { document.querySelector('[data-task="video"]').innerText = "Done"; document.querySelector('[data-task="video"]').disabled = true; }
                    }

                    renderInvestments(userData.investments);
                }
            });

            const allUsersRef = ref(db, 'users');
            const allUsersSnapshot = await get(allUsersRef);
            let refCount = 0;
            if (allUsersSnapshot.exists()) {
                const users = allUsersSnapshot.val();
                for (let uid in users) {
                    if (users[uid].referredBy === user.uid.substring(0, 6).toUpperCase()) refCount++;
                }
            }
            document.getElementById('friendsInvited').innerText = refCount;
            document.getElementById('refCountDetail').innerText = refCount;

            if (miningInterval) clearInterval(miningInterval);
            miningInterval = setInterval(() => {
                pendingNex += 0.001;
                document.getElementById('pendingBalance').innerText = `${pendingNex.toFixed(4)} NEX`;
            }, 1000);

        } else {
            document.getElementById('auth-section').style.display = 'block';
            document.getElementById('dashboard').style.display = 'none';
            if (miningInterval) clearInterval(miningInterval);
        }
    });

    function renderInvestments(investments) {
        const listDiv = document.getElementById('investmentsList');
        const countDiv = document.getElementById('activeInvestmentsCount');
        if (!investments) {
            listDiv.innerHTML = '<p class="empty-text">No active investments.</p>';
            countDiv.innerText = "0";
            return;
        }
        let html = ''; let count = 0;
        for (let name in investments) {
            count++;
            const inv = investments[name];
            const secondsPassed = (Date.now() - inv.lastHarvest) / 1000;
            const currentYield = ((inv.amount * inv.roi / 86400) * secondsPassed).toFixed(4);
            html += `
                <div class="active-investment-item">
                    <div>
                        <strong>${name}</strong> <span class="roi-badge">${(inv.roi*100).toFixed(0)}% ROI</span><br>
                        <small>Invested: ${inv.amount} NEX</small><br>
                        <small class="yield-text">Pending Yield: ${currentYield} NEX</small>
                    </div>
                    <button class="btn btn-success btn-harvest" onclick="harvestYield('${name}')"><i class="fa-solid fa-hand-holding-dollar"></i></button>
                </div>`;
        }
        listDiv.innerHTML = html;
        countDiv.innerText = count;
    }
});
