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
                        await update(ref(db, 'users/' + referrerId), {
                            balance: referrerBalance + 10
                        });
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
    document.getElementById('logoutBtn').addEventListener('click', () => {
        signOut(auth);
    });

    // 5. Live Mining & Claim Logic
    let miningInterval;
    let pendingNex = 0;

    document.getElementById('claimBtn').addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user || pendingNex <= 0) return;

        const userRef = ref(db, 'users/' + user.uid);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
            // Get current balance and make sure it's a number
            let currentBalance = parseFloat(snapshot.val().balance) || 0;
            
            // Add the EXACT pending amount (with 2 decimals)
            let totalToAdd = currentBalance + parseFloat(pendingNex.toFixed(2));
            
            // Update Firebase
            await update(userRef, { balance: totalToAdd });
            
            // Reset pending UI
            pendingNex = 0; 
            document.getElementById('pendingBalance').innerText = "0.00";
            
            // Instantly update the balance text on the screen
            document.getElementById('balance').innerText = totalToAdd.toFixed(2); 
        }
    });

    // 6. Track Auth State
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';

            const userRef = ref(db, 'users/' + user.uid);
            
            // Real-time listener for balance
            onValue(userRef, (snapshot) => {
                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    // Format balance to 2 decimal places
                    let bal = parseFloat(userData.balance || 0).toFixed(2);
                    document.getElementById('balance').innerText = bal;
                    
                    const refLink = `https://locky5533-lgtm.github.io/NexCoin/?inviteCode=${userData.myRefCode}`;
                    document.getElementById('refLink').value = refLink;
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

            // Start Live Mining Simulation
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
});
