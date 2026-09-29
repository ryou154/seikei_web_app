// Firebase Web configuration is public application metadata, not an Admin credential.
// Environment variables may override these values for another deployment.
module.exports = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAlP0nkmj5Rwi6e5tZAJ52SoxK-NCXFAbc",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "project-9e754eaa-8fe7-4918-87c.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "project-9e754eaa-8fe7-4918-87c",
  appId: process.env.FIREBASE_APP_ID || "1:688786456161:web:1b8d851318c851fa3c3420"
};
