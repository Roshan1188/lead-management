// src/redux/slice/auth/authApiSlice.ts
import apiSlice from "@/redux/apiSlice";

// ===== Types =====
export type RoleCode = 1 | 2; // 1=Telecaller, 2=Admin

export interface User {
  _id: string;
  name?: string;
  mobile: string;
  role: RoleCode | "admin" | "telecaller"; // tolerate string roles from backend
  avatarUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SendOtpRequest {
  mobile: string;
}
export interface SendOtpResponse {
  sent: boolean;
  otp?: string; // backend may return '123456'
}

export interface LoginRequest {
  mobile: string;
  otp: string;
}
export interface LoginResponse {
  token: string;
  user: User;
}

export interface UpdateProfileRequest {
  name?: string;
  avatar?: File | null; // multipart field name: "avatar"
}

// ---- helpers ----
const toRoleCode = (role: User["role"]): RoleCode =>
  role === 2 || String(role).toLowerCase() === "admin" ? 2 : 1;

const persistTokenByRole = (role: RoleCode, token: string) => {
  if (role === 2) {
    localStorage.setItem("adminToken", token);
    localStorage.removeItem("teleCallerToken");
  } else {
    localStorage.setItem("teleCallerToken", token);
    localStorage.removeItem("adminToken");
  }
};

// ===== Slice =====
const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // POST /api/auth/send-otp
    sendOtp: builder.mutation<SendOtpResponse, SendOtpRequest>({
      query: (body) => ({
        url: "/auth/send-otp",
        method: "POST",
        body,
      }),
    }),

    // POST /api/auth/login
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: "/auth/login",
        method: "POST",
        body,
      }),
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const role = toRoleCode(data.user.role);
          persistTokenByRole(role, data.token); // ✅ only one of adminToken / teleCallerToken
        } catch {
          // ignore
        }
      },
      invalidatesTags: ["User"],
    }),

    // GET /api/auth/me
    me: builder.query<User, void>({
      query: () => "/auth/me",
      providesTags: ["User"],
      keepUnusedDataFor: 300, // cache user for 5 minutes
    }),

    // PUT /api/auth/profile (multipart: avatar?, plus name?)
    updateProfile: builder.mutation<User, UpdateProfileRequest>({
      query: ({ name, avatar }) => {
        const form = new FormData();
        if (typeof name !== "undefined") form.set("name", String(name));
        if (avatar) form.append("avatar", avatar);
        return {
          url: "/auth/profile",
          method: "PUT",
          body: form, // don't set Content-Type manually
        };
      },
      invalidatesTags: ["User"],
    }),
  }),
  overrideExisting: true,
});

// ===== Hooks =====
export const {
  useSendOtpMutation,
  useLoginMutation,
  useMeQuery,
  useUpdateProfileMutation,
} = authApi;

export default authApi;
