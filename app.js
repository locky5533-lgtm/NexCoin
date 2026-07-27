import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, set, get, update, child, onValue, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

window.addEventListener('load', () => {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;

    window.showToast = (message, icon = "fa-circle-check") => {
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
        document.getElementById('toast-container').appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 50);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
    };

    const urlParams = new URLSearchParams(window.location.search);
    let inviteCode = urlParams.get('inviteCode') || "None";
    document.getElementById('refDisplay').innerText = inviteCode;

    // 1. Sign Up Logic (With Multi-Level Referrals)
    document.getElementById('signupBtn').addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const newRefCode = user.uid.substring(0, 6).toUpperCase();

            await set(ref(db, 'users/' + user.uid), {
                email: user.email, balance: 0, lifetimeEarned: 0, referralEarnings: 0,
                username: email.split('@')[0], country: "🌍 Global",
                referredBy: inviteCode !== "None" ? inviteCode : null,
                myRefCode: newRefCode, createdAt: new Date().toISOString(),
                streak: 0, lastCheckIn: null, tasks: { telegram: false, twitter: false, video: false }
            });

            // MULTI-LEVEL REFERRAL LOGIC
            if (inviteCode !== "None") {
                const dbRef = ref(db);
                const snapshot = await get(child(dbRef, `users`));
                if (snapshot.exists()) {
                    const users = snapshot.val();
                    
                    // Find Level 1 (Direct Referrer)
                    let l1_id = null;
                    for (let uid in users) {
                        if (users[uid].myRefCode === inviteCode) { l1_id = uid; break; }
                    }

                    if (l1_id) {
                        const l1_data = users[l1_id];
                        await update(ref(db, 'users/' + l1_id), { 
                            balance: (l1_data.balance || 0) + 10,
                            lifetimeEarned: (l1_data.lifetimeEarned || 0) + 10,
                            referralEarnings: (l1_data.referralEarnings || 0) + 10
                        });

                        // Find Level 2 (L1's Referrer)
                        const l1_refCode = l1_data.referredBy;
                        if (l1_refCode) {
                            let l2_id = null;
                            for (let uid in users) {
                                if (users[uid].myRefCode === l1_refCode) { l2_id = uid; break; }
                            }
                            if (l2_id) {
                                const l2_data = users[l2_id];
                                await update(ref(db, 'users/' + l2_id), { 
                                    balance: (l2_data.balance || 0) + 3,
                                    lifetimeEarned: (l2_data.lifetimeEarned || 0) + 3,
                                    referralEarnings: (l2_data.referralEarnings || 0) + 3
                                });

                                // Find Level 3 (L2's Referrer)
                                const l2_refCode = l2_data.referredBy;
                                if (l2_refCode) {
                                    let l3_id = null;
                                    for (let uid in users) {
                                        if (users[uid].myRefCode === l2_refCode) { l3_id = uid; break; }
                                    }
                                    if (l3_id) {
                                        const l3_data = users[l3_id];
                                        await update(ref(db, 'users/' + l3_id), { 
                                            balance: (l3_data.balance || 0) + 1,
                                            lifetimeEarned: (l3_data.lifetimeEarned || 0) + 1,
                                            referralEarnings: (l3_data.referralEarnings || 0) + 1
                                        });
                                    }
                                }
                            }
                        }
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
        document.getElementById('refLink').select(); document.execCommand('copy');
        window.showToast("Referral link copied!", "fa-clipboard-check");
    });

    // 2. Profile Modal Logic
    document.getElementById('openProfileBtn').addEventListener('click', async () => {
        const user = auth.currentUser;
        const snapshot = await get(ref(db, 'users/' + user.uid));
        if (snapshot.exists()) {
            document.getElementById('usernameInput').value = snapshot.val().username || "";
            document.getElementById('countryInput').value = snapshot.val().country || "🌍 Global";
        }
        document.getElementById('profileModal').style.display = 'flex';
    });
    document.getElementById('closeProfileModal').addEventListener('click', () => document.getElementById('profileModal').style.display = 'none');
    document.getElementById('saveProfileBtn').addEventListener('click', async () => {
        const user = auth.currentUser;
        const username = document.getElementById('usernameInput').value;
        const country = document.getElementById('countryInput').value;
        await update(ref(db, 'users/' + user.uid), { username: username, country: country });
        window.showToast("Profile updated!");
        document.getElementById('profileModal').style.display = 'none';
    });

    // 3. Mining Logic
    let miningInterval; let pendingNex = 0;
    document.getElementById('claimBtn').addEventListener('click', async () => {
        const user = auth.currentUser; if (!user || pendingNex <= 0) return;
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

    // 4. Investments
    document.querySelectorAll('.btn-invest').forEach(button => {
        button.addEventListener('click', async (e) => {
            const user = auth.currentUser; if (!user) return;
            const product = e.target.getAttribute('data-product'); const roi = parseFloat(e.target.getAttribute('data-roi')); const cost = parseFloat(e.target.getAttribute('data-cost'));
            const userRef = ref(db, 'users/' + user.uid); const snapshot = await get(userRef);
            if (snapshot.exists()) {
                let currentBalance = parseFloat(snapshot.val().balance) || 0;
                if (currentBalance >= cost) {
                    await update(userRef, { balance: currentBalance - cost });
                    await set(ref(db, `users/${user.uid}/investments/${product}`), { amount: cost, roi: roi, startTime: Date.now(), lastHarvest: Date.now() });
                    window.showToast(`Invested in ${product}!`);
                } else { window.showToast(`Need ${cost} NEX to invest`, "fa-triangle-exclamation"); }
            }
        });
    });

    window.harvestYield = async (productName) => {
        const user = auth.currentUser; if (!user) return;
        const userRef = ref(db, 'users/' + user.uid); const snapshot = await get(userRef);
        if (snapshot.exists()) {
            const data = snapshot.val(); const investment = data.investments?.[productName]; if (!investment) return;
            const secondsPassed = (Date.now() - investment.lastHarvest) / 1000;
            const earned = (investment.amount * investment.roi / 86400) * secondsPassed;
            if (earned > 0.001) {
                let earnedFixed = parseFloat(earned.toFixed(4));
                await update(userRef, { balance: (parseFloat(data.balance) || 0) + earnedFixed, lifetimeEarned: (parseFloat(data.lifetimeEarned) || 0) + earnedFixed, [`investments/${productName}/lastHarvest`]: Date.now() });
                window.showToast(`Harvested ${earnedFixed} NEX!`);
            } else { window.showToast("Not enough yield yet", "fa-hourglass-half"); }
        }
    };

    // 5. Check-in & Tasks (Same as before)
    document.getElementById('checkinBtn').addEventListener('click', async () => {
        const user = auth.currentUser; if (!user) return;
        const userRef = ref(db, 'users/' + user.uid); const snapshot = await get(userRef);
        if (snapshot.exists()) {
            const data = snapshot.val(); const today = new Date().toDateString();
            if (data.lastCheckIn === today) { window.showToast("Already checked in today!", "fa-circle-info"); return; }
            let newStreak = 1;
            if (data.lastCheckIn) {
                const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
                if (data.lastCheckIn === yesterday.toDateString()) newStreak = (data.streak || 0) + 1;
            }
            if (newStreak > 7) newStreak = 7;
            const reward = newStreak * 2;
            await update(userRef, { streak: newStreak, lastCheckIn: today, balance: (parseFloat(data.balance) || 0) + reward, lifetimeEarned: (parseFloat(data.lifetimeEarned) || 0) + reward });
            window.showToast(`Checked in! Earned ${reward} NEX!`);
        }
    });

    document.querySelectorAll('.btn-task').forEach(button => {
        button.addEventListener('click', async (e) => {
            const user = auth.currentUser; if (!user) return;
            const taskName = e.target.getAttribute('data-task'); const reward = parseInt(e.target.getAttribute('data-reward'));
            const userRef = ref(db, 'users/' + user.uid); const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data.tasks && data.tasks[taskName]) { window.showToast("Task already completed!", "fa-circle-info"); return; }
                if (taskName === 'telegram') window.open('https://t.me/your_channel', '_blank');
                if (taskName === 'twitter') window.open('https://twitter.com/your_page', '_blank');
                await update(userRef, { [`tasks/${taskName}`]: true, balance: (parseFloat(data.balance) || 0) + reward, lifetimeEarned: (parseFloat(data.lifetimeEarned) || 0) + reward });
                window.showToast(`Task completed! +${reward} NEX!`); e.target.innerText = "Done"; e.target.disabled = true;
            }
        });
    });

    // 6. Withdrawal
    document.getElementById('openWithdrawBtn').addEventListener('click', () => document.getElementById('withdrawModal').style.display = 'flex');
    document.getElementById('closeModal').addEventListener('click', () => document.getElementById('withdrawModal').style.display = 'none');
    document.getElementById('submitWithdraw').addEventListener('click', async () => {
        const user = auth.currentUser; if (!user) return;
        const method = document.getElementById('withdrawMethod').value; const account = document.getElementById('withdrawAccount').value; const amount = parseFloat(document.getElementById('withdrawAmount').value);
        if (!account || !amount || amount < 100) { window.showToast("Min withdrawal is 100 NEX", "fa-triangle-exclamation"); return; }
        const userRef = ref(db, 'users/' + user.uid); const snapshot = await get(userRef);
        if (snapshot.exists()) {
            let currentBalance = parseFloat(snapshot.val().balance) || 0;
            if (currentBalance >= amount) {
                await update(userRef, { balance: currentBalance - amount });
                const newWithdrawRef = push(ref(db, 'withdrawals'));
                await set(newWithdrawRef, { userId: user.uid, email: user.email, method, account, amount, status: 'pending', requestedAt: new Date().toISOString() });
                window.showToast("Withdrawal requested!"); document.getElementById('withdrawModal').style.display = 'none';
                document.getElementById('withdrawAccount').value = ''; document.getElementById('withdrawAmount').value = '';
            } else { window.showToast("Insufficient balance", "fa-triangle-exclamation"); }
        }
    });

    // 7. Auth State & Real-time Updates
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
                    if (userData.tasks) {
                        if (userData.tasks.telegram) { document.querySelector('[data-task="telegram"]').innerText = "Done"; document.querySelector('[data-task="telegram"]').disabled = true; }
                        if (userData.tasks.twitter) { document.querySelector('[data-task="twitter"]').innerText = "Done"; document.querySelector('[data-task="twitter"]').disabled = true; }
                        if (userData.tasks.video) { document.querySelector('[data-task="video"]').innerText = "Done"; document.querySelector('[data-task="video"]').disabled = true; }
                    }
                    renderInvestments(userData.investments);
                }
            });

            // Real-time Leaderboard & Referral Count
            const allUsersRef = ref(db, 'users');
            onValue(allUsersRef, (snapshot) => {
                let refCount = 0;
                let usersArray = [];
                if (snapshot.exists()) {
                    const users = snapshot.val();
                    for (let uid in users) {
                        if (users[uid].referredBy === user.uid.substring(0, 6).toUpperCase()) refCount++;
                        usersArray.push(users[uid]);
                    }
                }
                document.getElementById('friendsInvited').innerText = refCount;
                document.getElementById('refCountDetail').innerText = refCount;

                // Sort by lifetimeEarned for Leaderboard
                usersArray.sort((a, b) => (b.lifetimeEarned || 0) - (a.lifetimeEarned || 0));
                let top5 = usersArray.slice(0, 5);
                
                let lbHtml = '';
                top5.forEach((u, index) => {
                    let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index+1}`;
                    lbHtml += `<div class="leaderboard-item"><span>${medal} ${u.country || '🌍'} ${u.username || 'Anon'}</span> <span class="lb-score">${parseFloat(u.lifetimeEarned || 0).toFixed(1)} NEX</span></div>`;
                });
                document.getElementById('leaderboardList').innerHTML = lbHtml;
            });

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
        if (!investments) { listDiv.innerHTML = '<p class="empty-text">No active investments.</p>'; countDiv.innerText = "0"; return; }
        let html = ''; let count = 0;
        for (let name in investments) {
            count++;
            const inv = investments[name];
            const currentYield = ((inv.amount * inv.roi / 86400) * ((Date.now() - inv.lastHarvest) / 1000)).toFixed(4);
            html += `<div class="active-investment-item"><div><strong>${name}</strong> <span class="roi-badge">${(inv.roi*100).toFixed(0)}% ROI</span><br><small>Invested: ${inv.amount} NEX</small><br><small class="yield-text">Pending Yield: ${currentYield} NEX</small></div><button class="btn btn-success btn-harvest" onclick="harvestYield('${name}')"><i class="fa-solid fa-hand-holding-dollar"></i></button></div>`;
        }
        listDiv.innerHTML = html; countDiv.innerText = count;
    }
});
