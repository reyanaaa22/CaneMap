// Firebase SDK imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDocs, getDoc, query, where, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAWcIMy6hBF4aP6LTSS1PwtmZogUebAI4A",
  authDomain: "canemap-system.firebaseapp.com",
  projectId: "canemap-system",
  storageBucket: "canemap-system.firebasestorage.app",
  messagingSenderId: "624993566775",
  appId: "1:624993566775:web:5b1b72cb58203b46123fb2",
  measurementId: "G-08KFJQ1NEJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

window.collection = collection;
window.doc = doc;
window.setDoc = setDoc;
window.getDocs = getDocs;
window.getDoc = getDoc;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.serverTimestamp = serverTimestamp;
