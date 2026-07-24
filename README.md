<p align="center">
 <img src="frontend/public/logo.png" alt="BiteBetter Logo" width="220">
</p>

<h1 align="center">🍏 BiteBetter</h1>

<p align="center">
  <strong>Helping South Africans make healthier food choices through AI-powered nutritional insights.</strong>
</p>


## 📖 Overview

BiteBetter is a full-stack web application developed during the Discovery GradHack 2026.

Our goal is to help users make smarter food choices by providing instant nutritional analysis, healthier alternatives, and personalised recommendations using AI and the Discovery ecosystem.

---

## ✨ Features

- 🔍 Search food products
- 📷 Barcode & food scanning
- 🤖 AI-powered nutritional analysis
- ❤️ Healthier alternative recommendations
- 👤 User authentication
- 📊 Personal dashboard & history
- 🎯 Discovery integration

---

## 🛠 Tech Stack

### Frontend
- React
- Vite
- Axios
- React Router
- Tailwind CSS *(coming soon)*

### Backend
- Node.js
- Express.js

### Database & Authentication
- Supabase

### Deployment
- Vercel (Frontend)
- Render (Backend)

### Development
- Cursor
- Git
- GitHub

---

## 📂 Project Structure

```text
discovery-gradhack/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── .env.local
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   │
│   ├── server.js
│   ├── package.json
│   └── .env
│
└── README.md
```

---

## 🚀 Getting Started

### Clone the repository

```bash
git clone https://github.com/sabjoseph/discovery-gradhack.git
```

```bash
cd discovery-gradhack
```

---

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on:

```
http://localhost:5173
```

---

## Backend

```bash
cd backend
npm install
npm run dev
```

Runs on:

```
http://localhost:5000
```

---

## 🔐 Environment Variables

### Frontend

Create a `.env.local`

```env
VITE_API_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

### Backend

Create a `.env`

```env
PORT=5000

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## 🌐 Live Deployment

### Frontend

Hosted on **Vercel**

### Backend

Hosted on **Render**

---

## 👥 Team Meridian

Built with ❤️ during the Discovery GradHack 2026.

### Team Members

- Sabastian Joseph
- *Add teammate*
- *Add teammate*

---

## 📌 Current Status

- ✅ Project Setup
- ✅ Frontend Deployment
- ✅ Backend Deployment
- ✅ Supabase Integration
- 🚧 Feature Development

---

## 📄 License

This project was created for the Discovery GradHack 2026 competition.
