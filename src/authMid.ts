import { jwt } from "hono/jwt";

const authMiddleware = async (c: any, next: () => Promise<void>) => {
  console.log(c.env);
  jwt({
    secret: c.env.JWT_SECRET,
  });

  await next();
};

export default authMiddleware;
