// Firebase SDK imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDocs, getDoc, query, where, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
  // Add your Firebase config here
  // You'll need to replace this with your actual Firebase project configuration
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);

// Export Firebase services
window.auth = auth;
window.db = db;
window.collection = collection;
window.doc = doc;
window.setDoc = setDoc;
window.getDocs = getDocs;
window.getDoc = getDoc;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.serverTimestamp = serverTimestamp;
