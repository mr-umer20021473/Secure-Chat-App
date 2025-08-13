// src/UserList.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./UserList.css";

export default function UserList({ currentUser }) {
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("http://localhost:5000/api/users", {
      credentials: "include"
    })
      .then(resp => resp.json())
      .then(setUsers);
  }, []);

  function startChat(toUser) {
    // in a real app you'd fetch/create a convId—here we stub it
    const convId = 1;
    navigate(`/chat/${toUser}/${convId}`);
  }

  return (
    <div className="userlist-container">
      <div className="userlist-header">Start a conversation</div>
      <ul className="userlist-list">
        {users.map(u => (
          <li className="userlist-item" key={u.id}>
            <span>{u.username}</span>
            <button
              className="chat-button"
              onClick={() => startChat(u.username)}
            >
              Chat
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
