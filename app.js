import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, set, get, update, child, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

window.addEventListener('load', () => {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;

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
                        const referrerBalance = users[referrerId].balance || 0;
                        await update(ref(db, 'users/' + referrerId), { balance: referrerBalance + 10 });
                        alert("Sign up successful! Your referrer got 10 NEX.");
                    } else {
                        alert("Sign up successful!");
                    }
                }
            } else {
                alert("Sign up successful!");
            }
        } catch (error) {
            alert("Error: " + error.message);
        }
    });

    // 3. Login Logic
    document.getElementById('loginBtn').addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            alert("Error: " + error.message);
        }
    });

    // 4. Logout Logic
    document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

    // 5. Free Mining Logic
    let miningInterval;
    let pendingNex = 0;

    document.getElementById('claimBtn').addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user || pendingNex <= 0) return;

        const userRef = ref(db, 'users/' + user.uid);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
            let currentBalance = parseFloat(snapshot.val().balance) || 0;
            let totalToAdd = currentBalance + parseFloat(pendingNex.toFixed(2));
            await update(userRef, { balance: totalToAdd });
            pendingNex = 0; 
            document.getElementById('pendingBalance').innerText = "0.00";
        }
    });

    // 6. Investment Logic
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
                    // Deduct cost
                    let newBalance = currentBalance - cost;
                    await update(userRef, { balance: newBalance });

                    // Save Investment
                    const investmentsRef = ref(db, `users/${user.uid}/investments/${product}`);
                    await set(investmentsRef, {
                        amount: cost,
                        roi: roi,
                        startTime: Date.now(),
                        lastHarvest: Date.now()
                    });
                    alert(`Successfully invested in ${product}!`);
                } else {
                    alert(`Insufficient balance. You need ${cost} NEX.`);
                }
            }
        });
    });

    // 7. Harvest Investment Yield
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
            const yieldPerSecond = dailyYield / 86400; // 86400 seconds in a day
            const earned = yieldPerSecond * secondsPassed;

            if (earned > 0.01) {
                let currentBalance = parseFloat(data.balance) || 0;
                let newBalance = currentBalance + parseFloat(earned.toFixed(4));
                
                await update(userRef, { 
                    balance: newBalance,
                    [`investments/${productName}/lastHarvest`]: now
                });
                alert(`Harvested ${earned.toFixed(4)} NEX from ${productName}!`);
            } else {
                alert("Not enough yield generated yet. Wait a bit longer.");
            }
        }
    };

    // 8. Track Auth State
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';

            const userRef = ref(db, 'users/' + user.uid);
            
            // Real-time listener for user data
            onValue(userRef, (snapshot) => {
                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    let bal = parseFloat(userData.balance || 0).toFixed(2);
                    document.getElementById('balance').innerText = bal;
                    
                    const refLink = `https://locky5533-lgtm.github.io/NexCoin/?inviteCode=${userData.myRefCode}`;
                    document.getElementById('refLink').value = refLink;

                    // Render Active Investments
                    renderInvestments(userData.investments);
                }
            });

            // Count Referrals
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
            document.getElementById('refCount').innerText = refCount;

            // Start Free Mining Interval
            if (miningInterval) clearInterval(miningInterval);
            miningInterval = setInterval(() => {
                pendingNex += 0.1;
                document.getElementById('pendingBalance').innerText = pendingNex.toFixed(2);
            }, 1000);

        } else {
            document.getElementById('auth-section').style.display = 'block';
            document.getElementById('dashboard').style.display = 'none';
            if (miningInterval) clearInterval(miningInterval);
        }
    });

    // 9. Function to render investments and calculate live yield
    function renderInvestments(investments) {
        const listDiv = document.getElementById('investmentsList');
        if (!investments) {
            listDiv.innerHTML = '<p class="empty-text">No active investments. Buy one above!</p>';
            return;
        }

        let html = '';
        for (let name in investments) {
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
                        <i class="fa-solid fa-hand-holding-dollar"></i> Harvest
                    </button>
                </div>
            `;
        }
        listDiv.innerHTML = html;
    }
});
