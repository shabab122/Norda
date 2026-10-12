// Express serves the website and API together by default.
// A separate local development client uses the same hostname for cookies.
const separateDevelopmentClient = window.location.protocol === "file:" || ["3000", "5173", "5500", "8080"].includes(window.location.port);
const developmentHost = window.location.hostname || "localhost";
const API_BASE_URL = window.NORDA_API_URL || (separateDevelopmentClient ? "http://" + developmentHost + ":5000/api" : "/api");
