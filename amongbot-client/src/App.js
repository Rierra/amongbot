import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import "./chat.css";

const socket = io("http://localhost:5000");

function App() {
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);

  const messagesEndRef = useRef(null);
  const backgroundCanvasRef = useRef(null);

  const playSound = (type) => {
    let soundFile = 
      type === "incoming" ? "/sounds/message.ogg" : 
      type === "outgoing" ? "/sounds/sent.mp3" : 
      "";
    
    if (soundFile) {
      const sound = new Audio(soundFile);
      sound.play().catch(error => console.error("Error playing sound:", error));
    }
  };

  // Background matrix effect
  useEffect(() => {
    const canvas = backgroundCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const fontSize = 12;
    const columns = canvas.width / fontSize;
    
    // Characters to display
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンabcdefghijklmnopqrstuvwxyz';
    
    // Array to store current y position of each column
    const drops = [];
    for (let i = 0; i < columns; i++) {
      drops[i] = Math.floor(Math.random() * -canvas.height);
    }
    
    // Function to draw the matrix effect
    const drawMatrix = () => {
      // Semi-transparent black background to create trail effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Green text
      ctx.fillStyle = '#0f0';
      ctx.font = `${fontSize}px monospace`;
      
      // Draw each character
      for (let i = 0; i < drops.length; i++) {
        // Random character from the chars string
        const char = chars[Math.floor(Math.random() * chars.length)];
        // x coordinate of the character (column * fontSize)
        // y coordinate of the character (drops[i] * fontSize)
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);
        
        // Increase y position based on opacity
        drops[i]++;
        
        // If the character has gone off the screen, reset it to the top
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.98) {
          drops[i] = Math.floor(Math.random() * -20);
        }
      }
    };
    
    // Animation loop
    const matrixInterval = setInterval(drawMatrix, 50);
    
    // Window resize handler
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      // Reset drops array based on new width
      const newColumns = canvas.width / fontSize;
      drops.length = 0;
      for (let i = 0; i < newColumns; i++) {
        drops[i] = Math.floor(Math.random() * -canvas.height);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup function
    return () => {
      clearInterval(matrixInterval);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    socket.off("receiveMessage");
    socket.off("botJoined");
    socket.off("userTyping");
    socket.off("userStoppedTyping");

    socket.on("receiveMessage", (data) => {
      setMessages((prevMessages) => [...prevMessages, data]);
      playSound("incoming");
    });

    socket.on("botJoined", (data) => {
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          username: "SYSTEM",
          message: `${data.username} (bot) has joined the chat!`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    });

    socket.on("userTyping", ({ username }) => {
      setTypingUser(username);
    });

    socket.on("userStoppedTyping", () => {
      setTypingUser("");
    });

    return () => {
      socket.off("receiveMessage");
      socket.off("botJoined");
      socket.off("userTyping");
      socket.off("userStoppedTyping");
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const glow = document.querySelector(".cursor-glow");
      if (glow) {
        glow.style.left = `${e.clientX}px`;
        glow.style.top = `${e.clientY}px`;
      }
    };
  
    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);
  
  const joinRoom = () => {
    if (username.trim() !== "" && room.trim() !== "") {
      socket.emit("join_room", { username, room });
      setJoined(true);
    }
  };

  const sendMessage = () => {
    if (message.trim() !== "") {
      socket.emit("sendMessage", { username, room, message });
      socket.emit("stopTyping", { room });
      setMessage("");
      playSound("outgoing");
    }
  };

  const handleTyping = (e) => {
    setMessage(e.target.value);
    socket.emit("typing", { username, room });

    setTimeout(() => {
      socket.emit("stopTyping", { room });
    }, 1000);
  };

  const toggleAI = () => {
    const newAiStatus = !aiEnabled;
    setAiEnabled(newAiStatus);
    socket.emit("toggleAI", { room, enabled: newAiStatus });
  };

  return (
    <div className="app-wrapper">
      {/* Matrix background effect */}
      <canvas ref={backgroundCanvasRef} className="background-matrix"></canvas>
      
      {/* Show glow effect only on the main menu */}
      {!joined && <div className="cursor-glow"></div>}
  
      {/* Main Chat Container */}
      <div className="container">
        {!joined ? (
          <div className="login-form">
            <h2>Enter Room</h2>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="text"
              placeholder="Room ID"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            />
            <button onClick={joinRoom}>Join</button>
          </div>
        ) : (
          <div className="chat-container">
            <h2>Chat Room: {room}</h2>
            
            {/* AI Toggle button */}
            <div className="ai-toggle">
              <button 
                className={aiEnabled ? "ai-on" : "ai-off"} 
                onClick={toggleAI}
              >
                AI: {aiEnabled ? "On" : "Off"}
              </button>
            </div>
            
            <div id="messages" className="messages-container">
              {messages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`message ${msg.username === username ? 'user-message' : 
                    msg.username === 'SYSTEM' ? 'system-message' : 'other-message'}`}
                >
                  <strong>{msg.username}: </strong> {msg.message}
                  <div ref={index === messages.length - 1 ? messagesEndRef : null}></div>
                </div>
              ))}
              {typingUser && (
                <div className="typing-indicator">
                  {typingUser} is typing...
                </div>
              )}
            </div>
            
            <div className="input-container">
              <input
                type="text"
                placeholder="Type a message..."
                value={message}
                onChange={handleTyping}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              />
              <button onClick={sendMessage}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;