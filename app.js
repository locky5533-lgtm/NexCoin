import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Wait for Firebase to initialize
window.addEventListener('load', () => {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;

    // 1. Capture Invite Code from URL (?inviteCode=XXXX)
    const urlParams = new URLSearchParams(window.location.search);
    let inviteCode = urlParams.get('inviteCode');
    
    // If no invite code, generate a random one or set to null
    if (!inviteCode) {
        inviteCode = "None";
    }
    document.getElementById('refDisplay').innerText = inviteCode;

    // 2. Sign Up Logic
    document.getElementById('signupBtn').addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            // Create user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Generate a unique referral code for this new user (e.g., first 6 chars of UID)
            const newRefCode = user.uid.substring(0, 6).toUpperCase();

            // Create user document in Firestore
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                balance: 0, // Start with 0 balance
                referredBy: inviteCode !== "None" ? inviteCode : null,
                myRefCode: newRefCode,
                createdAt: new Date()
            });

            alert("Sign up successful!");
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

    // 5. Track Auth State (Show Dashboard if logged in)
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is logged in
            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';

            // Fetch user data from Firestore
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                document.getElementById('balance').innerText = userData.balance;
                
                // Set their personal referral link
                const refLink = `https://yourusername.github.io/my-crypto-app/?inviteCode=${userData.myRefCode}`;
                document.getElementById('refLink').value = refLink;
            }
        } else {
            // User is logged out
            document.getElementById('auth-section').style.display = 'block';
            document.getElementById('dashboard').style.display = 'none';
        }
    });
});
