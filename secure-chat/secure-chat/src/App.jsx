import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./Login";
import Register from "./Register";
import UserList from "./UserList";
import SecureChat from "./SecureChat";
import { useState, useEffect } from "react";

// Helper for localStorage
const LOCAL_USER_KEY = "securechat.user";

function App() {
  // On first render, check localStorage
  const [user, setUserState] = useState(() =>
    localStorage.getItem(LOCAL_USER_KEY)
  );

  // When you log in/register, save user in localStorage
  function setUser(username) {
    setUserState(username);
    if (username) {
      localStorage.setItem(LOCAL_USER_KEY, username);
    } else {
      localStorage.removeItem(LOCAL_USER_KEY);
    }
  }

  // Add a logout function for UI (optional)
  function handleLogout() {
    setUser(null);
    // Optionally, call your backend logout endpoint
    fetch("http://localhost:5000/api/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }

  return (
    <BrowserRouter>
      {user ? (
        <div style={{ textAlign: "right", padding: "0.5em" }}>
          <span>Logged in as <b>{user}</b></span>
          <button onClick={handleLogout} style={{ marginLeft: 12 }}>Logout</button>
        </div>
      ) : null}
      <Routes>
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route path="/register" element={<Register onRegister={setUser} />} />
        <Route path="/users" element={
          user ? <UserList currentUser={user} /> : <Navigate to="/login" />
        } />
        <Route path="/chat/:toUser/:convId" element={
          user ? <SecureChatWrapper currentUser={user} /> : <Navigate to="/login" />
        } />
        <Route path="/" element={<Navigate to={user ? "/users" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  );
}

import { useParams } from "react-router-dom";
function SecureChatWrapper({ currentUser }) {
  const { toUser, convId } = useParams();
  return (
    <SecureChat
      currentUser={currentUser}
      toUser={toUser}
      convId={parseInt(convId)}
    />
  );
}

export default App;
