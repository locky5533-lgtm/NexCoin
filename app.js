import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, set, get, update, child, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

window.addEventListener('load', () => {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;

    // Toast Notification Function
    window.showToast = (message, icon = "fa-circle-check") => {
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
        document.getElementById('toast-container').appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 50);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    // 1. Capture Invite Code
    const urlParams = new URLSearchParams(window.location.search);
    let inviteCode = urlParams.get('inviteCode') || "None";
    document.getElementById('refDisplay').innerText = inviteCode;

    // 2. Sign Up Logic
    document.getElementById('signupBtn').addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const newRefCode = user.uid.substring(0, 6).toUpperCase();

            await set(ref(db, 'users/' + user.uid), {
                email: user.email,
                balance: 0,
                lifetimeEarned: 0,
                referralEarnings: 0,
                referredBy: inviteCode !== "None" ? inviteCode : null,
                myRefCode: newRefCode,
                createdAt: new Date().toISOString()
            });

            if (inviteCode !== "None") {
                const dbRef = ref(db);
                const snapshot = await get(child(dbRef, `users`));
                if (snapshot.exists()) {
                    const users = snapshot.val();
                    let referrerId = null;
                    for (let uid in users) {
                        if (users[uid].myRefCode === inviteCode) {
                            referrerId = uid;
                            break;
                        }
                    }
                    if (referrerId) {
                        const refData = users[referrerId];
                        const refBalance = refData.balance || 0;
                        const refLife = refData.lifetimeEarned || 0;
                        const refEarn = refData.referralEarnings || 0;
                        
                        await update(ref(db, 'users/' + referrerId), { 
                            balance: refBalance + 10,
                            lifetimeEarned: refLife + 10,
                            referralEarnings: refEarn + 10
                        });
                        window.showToast("Referrer earned 10 NEX!");
                    }
                }
            }
            window.showToast("Account created successfully!");
        } catch (error) {
            window.showToast(error.message, "fa-circle-exclamation");
        }
    });

    // 3. Login Logic
    document.getElementById('loginBtn').addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            window.showToast(error.message, "fa-circle-exclamation");
        }
    });

    // 4. Logout Logic
    document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

    // 5. Copy Referral Link
    document.getElementById('copyBtn').addEventListener('click', () => {
        const refLink = document.getElementById('refLink');
        refLink.select();
        document.execCommand('copy');
        window.showToast("Referral link copied!", "fa-clipboard-check");
    });

    // 6. Free Mining Logic (0.001 NEX/sec)
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
            
            await update(userRef, { 
                balance: currentBalance + claimAmount,
                lifetimeEarned: currentLife + claimAmount
            });
            pendingNex = 0; 
            document.getElementById('pendingBalance').innerText = "0.0000 NEX";
            window.showToast(`Claimed ${claimAmount} NEX!`);
        }
    });

    // 7. Investment Logic
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
                    let newBalance = currentBalance - cost;
                    await update(userRef, { balance: newBalance });

                    const investmentsRef = ref(db, `users/${user.uid}/investments/${product}`);
                    await set(investmentsRef, {
                        amount: cost,
                        roi: roi,
                        startTime: Date.now(),
                        lastHarvest: Date.now()
                    });
                    window.showToast(`Invested in ${product}!`);
                } else {
                    window.showToast(`Need ${cost} NEX to invest`, "fa-triangle-exclamation");
                }
            }
        });
    });

    // 8. Harvest Investment Yield
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
            const yieldPerSecond = dailyYield / 86400; 
            const earned = yieldPerSecond * secondsPassed;

            if (earned > 0.001) {
                let currentBalance = parseFloat(data.balance) || 0;
                let currentLife = parseFloat(data.lifetimeEarned) || 0;
                let earnedFixed = parseFloat(earned.toFixed(4));
                
                await update(userRef, { 
                    balance: currentBalance + earnedFixed,
                    lifetimeEarned: currentLife + earnedFixed,
                    [`investments/${productName}/lastHarvest`]: now
                });
                window.showToast(`Harvested ${earnedFixed} NEX!`);
            } else {
                window.showToast("Not enough yield yet", "fa-hourglass-half");
            }
        }
    };

    // 9. Track Auth State
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';

            const userRef = ref(db, 'users/' + user.uid);
            
            onValue(userRef, (snapshot) => {
                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    
                    // Update Wallet
                    let bal = parseFloat(userData.balance || 0).toFixed(2);
                    document.getElementById('walletBalance').innerText = bal;
                    
                    // Update Lifetime
                    let life = parseFloat(userData.lifetimeEarned || 0).toFixed(2);
                    document.getElementById('lifetimeEarned').innerText = `${life} NEX`;

                    // Update Referral Earnings
                    let refEarn = parseFloat(userData.referralEarnings || 0).toFixed(2);
                    document.getElementById('referralEarnings').innerText = `${refEarn} NEX`;

                    // Ref Link
                    const refLink = `https://locky5533-lgtm.github.io/NexCoin/?inviteCode=${userData.myRefCode}`;
                    document.getElementById('refLink').value = refLink;

                    // Render Investments
                    renderInvestments(userData.investments);
                }
            });

            // Fetch Global Stats (Referrals)
            const allUsersRef = ref(db, 'users');
            const allUsersSnapshot = await get(allUsersRef);
            let refCount = 0;
            if (allUsersSnapshot.exists()) {
                const users = allUsersSnapshot.val();
                for (let uid in users) {
                    if (users[uid].referredBy === user.uid.substring(0, 6).toUpperCase()) {
                        refCount++;
                    }
                }
            }
            document.getElementById('friendsInvited').innerText = refCount;
            document.getElementById('refCountDetail').innerText = refCount;

            // Start Mining (0.001 NEX per second = 1ms tick * 0.00001? No, 1000ms tick * 0.001)
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

    // 10. Render Investments
    function renderInvestments(investments) {
        const listDiv = document.getElementById('investmentsList');
        const countDiv = document.getElementById('activeInvestmentsCount');
        
        if (!investments) {
            listDiv.innerHTML = '<p class="empty-text">No active investments.</p>';
            countDiv.innerText = "0";
            return;
        }

        let html = '';
        let count = 0;
        for (let name in investments) {
            count++;
            const inv = investments[name];
            const now = Date.now();
            const secondsPassed = (now - inv.lastHarvest) / 1000;
            const dailyYield = inv.amount * inv.roi;
            const yieldPerSecond = dailyYield / 86400;
            const currentYield = (yieldPerSecond * secondsPassed).toFixed(4);

            html += `
                <div class="active-investment-item">
                    <div>
                        <strong>${name}</strong> <span class="roi-badge">${(inv.roi*100).toFixed(0)}% ROI</span><br>
                        <small>Invested: ${inv.amount} NEX</small><br>
                        <small class="yield-text">Pending Yield: ${currentYield} NEX</small>
                    </div>
                    <button class="btn btn-success btn-harvest" onclick="harvestYield('${name}')">
                        <i class="fa-solid fa-hand-holding-dollar"></i>
                    </button>
                </div>
            `;
        }
        listDiv.innerHTML = html;
        countDiv.innerText = count;
    }
});
