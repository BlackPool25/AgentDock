import ky from "ky";

const getToken = () => localStorage.getItem("agentdock_token");

export const api = ky.create({
  prefixUrl: "/api",
  hooks: {
    beforeRequest: [
      (request) => {
        const token = getToken();
        if (token) request.headers.set("Authorization", `Bearer ${token}`);
      },
    ],
  },
});
