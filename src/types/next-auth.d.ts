import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    cabinId?: number | null;
    cabinName?: string | null;
    levelOrder?: number | null;
    levelName?: string | null;
  }

  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      userId?: number;
      cabinId?: number | null;
      cabinName?: string | null;
      levelOrder?: number | null;
      levelName?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    userId?: number;
    cabinId?: number | null;
    cabinName?: string | null;
    levelOrder?: number | null;
    levelName?: string | null;
  }
}
