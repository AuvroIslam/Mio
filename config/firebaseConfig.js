import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyAsIie6l3GQaFdzmMykxmB8kofnxPu_6BA",
  authDomain: "momometsushi.firebaseapp.com",
  projectId: "momometsushi",
  storageBucket: "momometsushi.appspot.com",
  messagingSenderId: "23300558442",
  appId: "1:23300558442:web:960dadef9559dbe490c413"
};

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
const db = getFirestore(app);

export { auth, db };