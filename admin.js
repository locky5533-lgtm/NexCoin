import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, get, update, onValue, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

window.addEventListener('load', () => {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;

    // Admin Login Logic
    document.getElementById('adminLoginBtn').addEventListener('click', async () => {
        const email = document.getElementById('adminEmail').value;
        const password = document.getElementById('adminPass').value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            alert("Error: " + error.message);
        }
    });

    document.getElementById('adminLogoutBtn').addEventListener('click', () => signOut(auth));

    // Track Admin Auth State
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Check if the logged-in user is the admin (replace with your admin email)
            const adminEmail = "locky5533@gmail.com"; // <--- CHANGE THIS TO YOUR REAL ADMIN EMAIL
            if (user.email === adminEmail) {
                document.getElementById('adminLogin').style.display = 'none';
                document.getElementById('adminDashboard').style.display = 'block';
                loadRequests();
            } else {
                alert("You are not an admin.");
                signOut(auth);
            }
        } else {
            document.getElementById('adminLogin').style.display = 'block';
            document.getElementById('adminDashboard').style.display = 'none';
        }
    });

    // Load Deposits and Withdrawals in Real-Time
    function loadRequests() {
        // Deposits
        const depositsRef = ref(db, 'deposits');
        onValue(depositsRef, (snapshot) => {
            const listDiv = document.getElementById('depositsList');
            let html = '';
            if (snapshot.exists()) {
                const deposits = snapshot.val();
                for (let id in deposits) {
                    const dep = deposits[id];
                    if (dep.status === 'pending') {
                        // 1 USD = 100 NEX
                        const nexToCredit = parseFloat(dep.amountUsd) * 100;
                        html += `
                            <div class="req-item">
                                <div class="req-details">
                                    <p><strong>${dep.email}</strong></p>
                                    <p>Method: ${dep.method}</p>
                                    <p>TxID/Number: ${dep.txId}</p>
                                    <p>Amount Sent: $${dep.amountUsd}</p>
                                    <p>NEX to Credit: ${nexToCredit}</p>
                                </div>
                                <div class="req-actions">
                                    <button class="btn-approve" onclick="approveDeposit('${id}', '${dep.userId}', ${nexToCredit})">Approve</button>
                                    <button class="btn-reject" onclick="rejectRequest('deposits', '${id}')">Reject</button>
                                </div>
                            </div>
                        `;
                    }
                }
            }
            listDiv.innerHTML = html || '<p>No pending deposits.</p>';
        });

        // Withdrawals
        const withdrawalsRef = ref(db, 'withdrawals');
        onValue(withdrawalsRef, (snapshot) => {
            const listDiv = document.getElementById('withdrawalsList');
            let html = '';
            if (snapshot.exists()) {
                const withdrawals = snapshot.val();
                for (let id in withdrawals) {
                    const wit = withdrawals[id];
                    if (wit.status === 'pending') {
                        html += `
                            <div class="req-item">
                                <div class="req-details">
                                    <p><strong>${wit.email}</strong></p>
                                    <p>Method: ${wit.method}</p>
                                    <p>Account: ${wit.account}</p>
                                    <p>Amount: ${wit.amount} NEX</p>
                                </div>
                                <div class="req-actions">
                                    <button class="btn-approve" onclick="approveWithdrawal('${id}')">Mark Paid</button>
                                    <button class="btn-reject" onclick="rejectRequest('withdrawals', '${id}')">Reject</button>
                                </div>
                            </div>
                        `;
                    }
                }
            }
            listDiv.innerHTML = html || '<p>No pending withdrawals.</p>';
        });
    }

    // Approve Deposit: Add NEX to user balance, delete request
    window.approveDeposit = async (reqId, userId, nexAmount) => {
        if (!confirm(`Credit user ${nexAmount} NEX?`)) return;
        const userRef = ref(db, 'users/' + userId);
        const userSnap = await get(userRef);
        
        if (userSnap.exists()) {
            const currentBalance = parseFloat(userSnap.val().balance) || 0;
            const currentLife = parseFloat(userSnap.val().lifetimeEarned) || 0;
            
            await update(userRef, {
                balance: currentBalance + nexAmount,
                lifetimeEarned: currentLife + nexAmount
            });
            
            await remove(ref(db, 'deposits/' + reqId));
            alert("Deposit approved and user credited!");
        }
    };

    // Approve Withdrawal: Just mark as paid (balance was already deducted when they requested)
    window.approveWithdrawal = async (reqId) => {
        if (!confirm("Mark this withdrawal as paid?")) return;
        await remove(ref(db, 'withdrawals/' + reqId));
        alert("Withdrawal marked as paid!");
    };

    // Reject Request: Delete it from database
    window.rejectRequest = async (type, reqId) => {
        if (!confirm("Are you sure you want to reject this?")) return;
        await remove(ref(db, type + '/' + reqId));
        alert("Request rejected.");
    };
});
