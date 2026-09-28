import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import Splash from "./components/splash";
import Login from "./components/login";
import Signup from "./components/signup";
import Home from "./components/home";
import Organization from "./components/organization";
import Requirements from "./components/requirements";
import Generation from "./components/generation";
import Dashboard from "./components/dashboard";
import Navbar from "./components/navbar";

function isAuthenticated() {
  return Boolean(localStorage.getItem("archify_token"));
}

function PrivateRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-brand">
          <span className="site-footer-mark">A</span>Archify
        </span>
        <span className="site-footer-tag mono">Rule-based network design engine</span>
        <nav className="site-footer-links">
          <Link to="/">Home</Link>
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
        </nav>
      </div>
    </footer>
  );
}

// nav = true only on logged-in screens; public pages (landing, login, signup)
// never mount the Navbar, so a saved token can't redirect them away.
function Shell({ children, nav = false }) {
  return (
    <div className="app-shell">
      {nav && isAuthenticated() && <Navbar />}
      <div className="page-content">{children}</div>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Shell><Splash /></Shell>} />
        <Route path="/login" element={<Shell><Login /></Shell>} />
        <Route path="/signup" element={<Shell><Signup /></Shell>} />

        <Route
          path="/home"
          element={
            <PrivateRoute>
              <Shell nav>
                <Home />
              </Shell>
            </PrivateRoute>
          }
        />

        <Route
          path="/organizations/:orgId"
          element={
            <PrivateRoute>
              <Shell nav>
                <Organization />
              </Shell>
            </PrivateRoute>
          }
        />

        <Route
          path="/organizations/:orgId/requirements"
          element={
            <PrivateRoute>
              <Shell nav>
                <Requirements />
              </Shell>
            </PrivateRoute>
          }
        />

        <Route
          path="/organizations/:orgId/generation"
          element={
            <PrivateRoute>
              <Shell nav>
                <Generation />
              </Shell>
            </PrivateRoute>
          }
        />

        <Route
          path="/organizations/:orgId/dashboard"
          element={
            <PrivateRoute>
              <Shell nav>
                <Dashboard />
              </Shell>
            </PrivateRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}