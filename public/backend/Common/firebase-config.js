// Firebase SDK imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getAuth, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDocs, getDoc, query, where, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAWcIMy6hBF4aP6LTSS1PwtmZogUebAI4A",
  authDomain: "canemap-system.firebaseapp.com",
  projectId: "canemap-system",
  storageBucket: "canemap-system.appspot.com",
  messagingSenderId: "624993566775",
  appId: "1:624993566775:web:5b1b72cb58203b46123fb2",
  measurementId: "G-08KFJQ1NEJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Expose commonly used auth helpers for non-module scripts
// This allows classic scripts (e.g., lobby.js) to call signOut(auth)
// without needing to import modules directly.
// Intentionally minimal global exposure.
// eslint-disable-next-line no-undef
window.auth = auth;
// eslint-disable-next-line no-undef
window.signOut = signOut;

window.collection = collection;
window.doc = doc;
window.setDoc = setDoc;
window.getDocs = getDocs;
window.getDoc = getDoc;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.serverTimestamp = serverTimestamp;
