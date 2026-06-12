import ky from "ky";

export const api = ky.create({
  prefixUrl: "/api",
  timeout: false,
  hooks: {
    beforeRequest: [
      (req) => {
        const token = localStorage.getItem("agentdock_token");
        if (token) req.headers.set("Authorization", `Bearer ${token}`);
      },
    ],
    afterResponse: [
      async (_req, _opts, res) => {
        if (res.status === 401) {
          localStorage.removeItem("agentdock_token");
          window.location.href = "/login";
        }
      },
    ],
  },
});
