require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.use(cors());

const chatHistory = {};
const roomStyles = {}; // Stores chat styles per room
const roomAIEnabled = {}; // Tracks if AI is enabled in each room (default true)

// **Analyze message style (slang, formal, emojis)**
function analyzeChatStyle(message, room) {
  if (!roomStyles[room]) roomStyles[room] = { casual: 0, formal: 0, emojiUsage: 0 };

  if (message.match(/\b(bro|lol|nah|yo|dawg|gonna|lowkey)\b/i)) {
    roomStyles[room].casual += 1;
  }
  if (message.match(/\b(therefore|hence|indeed|moreover|furthermore)\b/i)) {
    roomStyles[room].formal += 1;
  }
  if (message.match(/[😂🔥👍💀🤣💯🎉🎊😅]/)) {
    roomStyles[room].emojiUsage += 1;
  }
}

// **Generate dynamic personality based on chat style**
function getDynamicPersonality(room) {
  return "You are a normal, friendly person in a group chat. Never mention being AI or a bot. Keep responses short but not dismissive. Be friendly but not overly enthusiastic. Be natural and balanced - not too excited but not too disinterested either. Use casual language. Respond to the content of messages. If asked a question, give a brief opinion or answer. Occasionally use slang but not every message. Be a bit more engaged when asked direct questions.";
}

// **Make AI responses sound naturally human**
function tweakMessageStyle(message, room) {
  // First, clean up obvious AI patterns
  message = message
    .replace(/As an AI|AI assistant|I'm an AI|I don't have|I cannot|I'm not able to/gi, "")
    .replace(/I'm here to help|I'd be happy to|Is there anything else|Can I help you with/gi, "");
  
  // Introduce very human-like typing errors occasionally (but not too often)
  if (Math.random() > 0.9) {
    const typoOptions = [
      // Swap adjacent letters
      () => {
        const words = message.split(' ');
        if (words.length > 2) {
          const wordToTypo = words[Math.floor(Math.random() * words.length)];
          if (wordToTypo.length > 3) {
            const pos = Math.floor(Math.random() * (wordToTypo.length - 2)) + 1;
            const typoWord = wordToTypo.substring(0, pos) + wordToTypo[pos+1] + wordToTypo[pos] + wordToTypo.substring(pos+2);
            words[words.indexOf(wordToTypo)] = typoWord;
          }
        }
        return words.join(' ');
      },
      // Double letter
      () => {
        const pos = Math.floor(Math.random() * message.length);
        return message.substring(0, pos) + message[pos] + message.substring(pos);
      }
    ];
    
    message = typoOptions[Math.floor(Math.random() * typoOptions.length)]();
  }
  
  // Mimic human texting style
  message = message
    .toLowerCase() // Humans rarely capitalize in chat
    .replace(/\./g, "") // Humans often drop periods
    .replace(/\bi\b/g, "i") // Keep "I" lowercase like most texters do
    .replace(/([.!?])\s+(\w)/g, (_, p, w) => p + " " + w.toLowerCase()); // No capital after period in casual chat
    
  // Add realistic pacing (occasional pauses with ... or commas)
  if (message.length > 20 && Math.random() > 0.8) {
    const words = message.split(' ');
    const pausePos = Math.floor(words.length / 2);
    if (Math.random() > 0.5) {
      words.splice(pausePos, 0, "...");
    } else {
      words[pausePos-1] = words[pausePos-1] + ",";
    }
    message = words.join(' ');
  }
  
  // Add occasional slang/text speak (but not too much)
  if (Math.random() > 0.8) {
    const replacements = [
      [/\byou\b/g, "u"],
      [/\bwith\b/g, "w"],
      [/\btomorrow\b/g, "tmrw"],
      [/\btoday\b/g, "today"],
      [/\bwhat are you\b/g, "wyd"],
      [/\bhow are you\b/g, "hyd"]
    ];
    
    // Only apply 1-2 replacements, not all of them
    const numReplacements = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < numReplacements && i < replacements.length; i++) {
      const idx = Math.floor(Math.random() * replacements.length);
      message = message.replace(replacements[idx][0], replacements[idx][1]);
    }
  }
  
  // Occasionally add flavor words
  if (Math.random() > 0.8) {
    const flavorWords = ["lol", "haha", "fr", "yeah", "hmm", "idk"];
    const word = flavorWords[Math.floor(Math.random() * flavorWords.length)];
    
    if (Math.random() > 0.5) {
      message = word + " " + message;
    } else {
      message = message + " " + word;
    }
  }
  
  // Keep responses brief but not too brief
  // Avoid single-word responses most of the time
  if (message.split(' ').length === 1 && Math.random() > 0.3) {
    const expansions = {
      "yes": ["mhm", "yeah", "yep", "yup", "totally", "yeah man"],
      "no": ["nah", "not really", "don't think so", "nope", "nuh uh"],
      "okay": ["ok cool", "sounds good", "alright", "k", "aight", "ight"],
      "thanks": ["thanks!", "appreciate it", "ty"],
      "hello": ["heyy", "hey", "hi", "sup", "yoo"],
      "goodbye": ["later", "see ya", "bye", "peace", "bai", "bye bro"],
      "what": ["what's up?", "what do you mean?", "huh?", "wym", "whar"],
      "why": ["how come?", "why's that?", "for real?", "whyy"],
      "idk": ["i have no idea", "not sure tbh", "beats me"],
      "whatever": ["ah whatever", "doesn't matter", "it's fine"]
    };
    
    const key = Object.keys(expansions).find(k => message.toLowerCase().includes(k));
    if (key) {
      const options = expansions[key];
      message = options[Math.floor(Math.random() * options.length)];
    }
  }
  
  // Humans are brief in chat, but not dismissive
  if (message.length > 80) {
    message = message.substring(0, 80);
    // Make sure we don't cut mid-word
    if (message.match(/\w$/)) {
      message = message.substring(0, message.lastIndexOf(' '));
    }
  }
  
  return message.trim();
}

// Function to check if message is a question or needs engagement
function needsEngagement(message) {
  return message.includes('?') || 
         message.match(/\b(how|what|why|when|where|who|which|whose|whom)\b/i) ||
         message.match(/\b(can you|do you|will you|could you|would you)\b/i);
}

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("join_room", ({ username, room }) => {
    socket.join(room);
    console.log(`${username} joined room ${room}`);

    // Set default AI enabled for new rooms
    if (roomAIEnabled[room] === undefined) {
      roomAIEnabled[room] = true;
    }

    // Announce AI bot joining
    const botMessage = {
      username: "SYSTEM",
      message: "AI_Buddy (bot) just pulled up",
      timestamp: new Date().toLocaleTimeString()
    };
    io.to(room).emit("receiveMessage", botMessage);
  });

  // Handle AI toggle
  socket.on("toggleAI", ({ room, enabled }) => {
    roomAIEnabled[room] = enabled;
    console.log(`AI in room ${room} is now ${enabled ? "enabled" : "disabled"}`);
    
    // Broadcast AI status change to all users in the room
    const statusMessage = {
      username: "SYSTEM",
      message: `AI_Buddy is now ${enabled ? "active" : "inactive"}`,
      timestamp: new Date().toLocaleTimeString()
    };
    io.to(room).emit("receiveMessage", statusMessage);
  });

  socket.on("sendMessage", async ({ username, room, message }) => {
    console.log(`Received message from ${username}: "${message}"`);

    // Send user message to the chat
    const userMessage = {
      username,
      message,
      timestamp: new Date().toLocaleTimeString()
    };
    io.to(room).emit("receiveMessage", userMessage);

    // Only generate AI response if AI is enabled for this room
    if (roomAIEnabled[room] !== false) {
      // AI Bot Typing Simulation
      io.to(room).emit("userTyping", { username: "AI_Buddy" });

      // Randomize typing delay to be more human-like (300ms to 2000ms)
      const messageLength = message.length;
      const typingDelay = 300 + Math.min(Math.floor(messageLength * 30 + Math.random() * 1000), 2000);
      
      setTimeout(async () => {
        // AI Bot Response
        const botResponse = await getBotResponse(message, room);
        
        // Don't respond if empty response (simulating seen-but-no-reply)
        if (botResponse) {
          const botMessage = {
            username: "AI_Buddy",
            message: botResponse,
            timestamp: new Date().toLocaleTimeString()
          };
          io.to(room).emit("receiveMessage", botMessage);
        }
        
        io.to(room).emit("userStoppedTyping"); // Stop typing indication
      }, typingDelay); // Human-like typing delay
    }
  });

  // Handle Typing Indicator
  socket.on("typing", ({ username, room }) => {
    socket.to(room).emit("userTyping", { username });
  });

  socket.on("stopTyping", ({ room }) => {
    socket.to(room).emit("userStoppedTyping");
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

// Function to get AI response from Groq with a naturally human-like tone
async function getBotResponse(userMessage, room) {
  try {
    console.log("🔄 Sending request to Groq API...");

    if (!chatHistory[room]) chatHistory[room] = [];
    if (!roomStyles[room]) roomStyles[room] = { casual: 0, formal: 0, emojiUsage: 0 };

    // Analyze user message style
    analyzeChatStyle(userMessage, room);

    // Keep history limited
    chatHistory[room].push({ role: "user", content: userMessage });
    if (chatHistory[room].length > 10) chatHistory[room].shift();

    // Check if the message requires engagement
    const isQuestion = needsEngagement(userMessage);
    
    // Add a specific instruction based on message type
    let contextualInstruction = isQuestion 
      ? " Give a proper answer to the question, but keep it casual and brief." 
      : " Respond naturally without being dismissive. Don't just say 'ok' or 'whatever'.";
      
    // If user message seems negative/critical, respond more engagingly
    if (userMessage.match(/\b(lame|boring|mean|stupid|bad|worst|hate|terrible)\b/i)) {
      contextualInstruction = " They seem upset or negative. Be a bit more engaging without being defensive.";
    }

    // Human-like personality
    const aiPersonality = getDynamicPersonality(room) + contextualInstruction;

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-8b-8192",
        messages: [
          { 
            role: "system", 
            content: aiPersonality
          },
          ...chatHistory[room]
        ],
        temperature: 0.8,
        max_tokens: 50
      },
      {
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Groq API Response:", response.data);
    let aiReply = response.data.choices[0].message.content;

    // Apply human-like message modifications
    aiReply = tweakMessageStyle(aiReply, room);

    // Store AI response and update learning
    chatHistory[room].push({ role: "assistant", content: aiReply });
    analyzeChatStyle(aiReply, room);

    // 5% chance of simulating "seen but no reply" for added realism
    // But only for messages that aren't questions
    if (!isQuestion && Math.random() < 0.05) {
      return "";
    }

    return aiReply;
  } catch (error) {
    console.error("🚨 Error getting AI response:", error.response?.data || error.message);
    return "my phone glitched lol";
  }
}

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

