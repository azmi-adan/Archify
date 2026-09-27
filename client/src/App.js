import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

function Layout({ children }) {
  return (
    <>
      {isAuthenticated() && <Navbar />}
      <div className="page-content">{children}</div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route
          path="/home"
          element={
            <PrivateRoute>
              <Layout>
                <Home />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/organizations/:orgId"
          element={
            <PrivateRoute>
              <Layout>
                <Organization />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/organizations/:orgId/requirements"
          element={
            <PrivateRoute>
              <Layout>
                <Requirements />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/organizations/:orgId/generation"
          element={
            <PrivateRoute>
              <Layout>
                <Generation />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/organizations/:orgId/dashboard"
          element={
            <PrivateRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}