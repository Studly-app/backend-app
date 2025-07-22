import { Context, Hono } from "hono";

const user = new Hono<{ Bindings: CloudflareBindings }>();

// user.use()
import { jwt, sign } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../hash_password";

import Prisma from "../prisma_adapt";

// Types et interfaces
interface JWTPayload {
  userId: string;
  email: string;
  exp: number;
}

// Configuration de Prisma pour Cloudflare Workers

// Schémas de validation Zod
const registerSchema = z.object({
  email: z.string().email("Email invalide"),
  nom: z.string().optional(),
  prenom: z.string().optional(),
  password: z
    .string()
    .min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  dataInscription: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

const updateUserSchema = z.object({
  email: z.string().email("Email invalide").optional(),
  nom: z.string().optional(),
  prenom: z.string().optional(),
  password: z
    .string()
    .min(6, "Le mot de passe doit contenir au moins 6 caractères")
    .optional(),
  dataInscription: z.string().optional(),
  typesUtilisateur: z.enum(["USER", "ADMIN"]).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z
    .string()
    .min(6, "Le nouveau mot de passe doit contenir au moins 6 caractères"),
});

// Middleware d'authentification
const authMiddleware = async (c: any, next: () => Promise<void>) => {
  console.log(c.env);
  jwt({
    secret: c.env.JWT_SECRET,
  });

  await next();
};

// Middleware pour extraire l'utilisateur du token
const getCurrentUser = async (c: any) => {
  const payload = c.get("jwtPayload") as JWTPayload;
  return payload;
};

// 1. CRÉER UN UTILISATEUR (Register)
user.post("/register", zValidator("json", registerSchema), async (c) => {
  try {
    const { email, nom, prenom, password, dataInscription } =
      c.req.valid("json");
    const prisma = Prisma(c.env);

    // Vérifier si l'email existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return c.json(
        { error: "Un utilisateur avec cet email existe déjà" },
        400
      );
    }

    // Hasher le mot de passe
    const hashedPassword = await hashPassword(password);

    // Créer l'utilisateur
    const user = await prisma.user.create({
      data: {
        email,
        nom,
        prenom,
        password: hashedPassword,
        dataInscription,
        typesUtilisateur: "USER",
      },
      select: {
        id: true,
        email: true,
        nom: true,
        prenom: true,
        dataInscription: true,
        typesUtilisateur: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return c.json(
      {
        message: "Utilisateur créé avec succès",
        user,
      },
      201
    );
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// 2. CONNEXION UTILISATEUR (Login)
user.post("/login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    console.log(email);
    const prisma = Prisma(c.env);

    // Vérifier si l'utilisateur existe
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return c.json({ error: "Email ou mot de passe incorrect" }, 400);
    }

    // Vérifier le mot de passe
    const validPassword = await verifyPassword(password, user.password);
    if (!validPassword) {
      return c.json({ error: "Email ou mot de passe incorrect" }, 400);
    }

    // Mettre à jour la dernière connexion
    await prisma.user.update({
      where: { id: user.id },
      data: { derniereConnexion: new Date() },
    });

    // Générer le token JWT

    const token = await sign(
      {
        userId: user.id,
        email: user.email,
        exp: Math.floor(Date.now() / 1000) + 72 * 60 * 60, // 72h
      },
      c.env.JWT_SECRET
    );

    return c.json({
      message: "Connexion réussie",
      token,
      user: {
        id: user.id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        typesUtilisateur: user.typesUtilisateur,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la connexion:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// 3. RÉCUPÉRER TOUS LES UTILISATEURS (GET ALL)
user.get("/", authMiddleware, async (c) => {
  try {
    const prisma = Prisma(c.env);
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "10");
    const search = c.req.query("search");
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { nom: { contains: search, mode: "insensitive" } },
            { prenom: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        nom: true,
        prenom: true,
        dataInscription: true,
        derniereConnexion: true,
        typesUtilisateur: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            ReponsesUtilisateur: true,
            LeconsUtilisateur: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    const total = await prisma.user.count({ where });

    console.log(c.env.JWT_SECRET);

    return c.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des utilisateurs:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// 4. RÉCUPÉRER UN UTILISATEUR PAR ID (GET ONE)
user.get("/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const prisma = Prisma(c.env);

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        nom: true,
        prenom: true,
        dataInscription: true,
        derniereConnexion: true,
        typesUtilisateur: true,
        createdAt: true,
        updatedAt: true,
        ReponsesUtilisateur: {
          select: {
            id: true,
            createdAt: true,
          },
        },
        LeconsUtilisateur: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      return c.json({ error: "Utilisateur non trouvé" }, 404);
    }

    return c.json(user);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'utilisateur:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// 5. METTRE À JOUR UN UTILISATEUR (UPDATE)
user.put(
  "/:id",
  authMiddleware,
  zValidator("json", updateUserSchema),
  async (c) => {
    try {
      const id = c.req.param("id");
      const {
        email,
        nom,
        prenom,
        password,
        dataInscription,
        typesUtilisateur,
      } = c.req.valid("json");
      const prisma = Prisma(c.env);

      // Vérifier si l'utilisateur existe
      const existingUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        return c.json({ error: "Utilisateur non trouvé" }, 404);
      }

      // Vérifier si l'email est déjà utilisé par un autre utilisateur
      if (email && email !== existingUser.email) {
        const emailExists = await prisma.user.findUnique({
          where: { email },
        });
        if (emailExists) {
          return c.json({ error: "Cet email est déjà utilisé" }, 400);
        }
      }

      // Préparer les données à mettre à jour
      const updateData: any = {};
      if (email) updateData.email = email;
      if (nom) updateData.nom = nom;
      if (prenom) updateData.prenom = prenom;
      if (dataInscription) updateData.dataInscription = dataInscription;
      if (typesUtilisateur) updateData.typesUtilisateur = typesUtilisateur;

      // Hasher le nouveau mot de passe si fourni
      if (password) {
        updateData.password = await hashPassword(password);
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          nom: true,
          prenom: true,
          dataInscription: true,
          derniereConnexion: true,
          typesUtilisateur: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return c.json({
        message: "Utilisateur mis à jour avec succès",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Erreur lors de la mise à jour de l'utilisateur:", error);
      return c.json({ error: "Erreur serveur" }, 500);
    }
  }
);

// 6. SUPPRIMER UN UTILISATEUR (DELETE)
user.delete("/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const prisma = Prisma(c.env);

    // Vérifier si l'utilisateur existe
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return c.json({ error: "Utilisateur non trouvé" }, 404);
    }

    // Supprimer l'utilisateur
    await prisma.user.delete({
      where: { id },
    });

    return c.json({ message: "Utilisateur supprimé avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression de l'utilisateur:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// 7. RÉCUPÉRER LE PROFIL DE L'UTILISATEUR CONNECTÉ
user.get("/profile/me", async (c) => {
  try {
    const currentUser = await getCurrentUser(c);
    const prisma = Prisma(c.env);

    const user = await prisma.user.findUnique({
      where: { id: currentUser.userId },
      select: {
        id: true,
        email: true,
        nom: true,
        prenom: true,
        dataInscription: true,
        derniereConnexion: true,
        typesUtilisateur: true,
        createdAt: true,
        updatedAt: true,
        ReponsesUtilisateur: {
          select: {
            id: true,
            createdAt: true,
          },
        },
        LeconsUtilisateur: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      return c.json({ error: "Utilisateur non trouvé" }, 404);
    }

    return c.json(user);
  } catch (error) {
    console.error("Erreur lors de la récupération du profil:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// 8. CHANGER LE MOT DE PASSE
user.put(
  "/profile/change-password",
  authMiddleware,
  zValidator("json", changePasswordSchema),
  async (c) => {
    try {
      const { currentPassword, newPassword } = c.req.valid("json");
      const currentUser = await getCurrentUser(c);
      const prisma = Prisma(c.env);

      // Récupérer l'utilisateur actuel
      const user = await prisma.user.findUnique({
        where: { id: currentUser.userId },
      });

      if (!user) {
        return c.json({ error: "Utilisateur non trouvé" }, 404);
      }

      // Vérifier l'ancien mot de passe
      const validPassword = await verifyPassword(
        currentPassword,
        user.password
      );
      if (!validPassword) {
        return c.json({ error: "Mot de passe actuel incorrect" }, 400);
      }

      // Hasher le nouveau mot de passe
      const hashedNewPassword = await hashPassword(newPassword);

      // Mettre à jour le mot de passe
      await prisma.user.update({
        where: { id: currentUser.userId },
        data: { password: hashedNewPassword },
      });

      return c.json({ message: "Mot de passe modifié avec succès" });
    } catch (error) {
      console.error("Erreur lors du changement de mot de passe:", error);
      return c.json({ error: "Erreur serveur" }, 500);
    }
  }
);

// 9. DÉCONNEXION (Logout)
user.post("/logout", authMiddleware, async (c) => {
  try {
    // Avec JWT, la déconnexion est gérée côté client
    // Vous pouvez implémenter une blacklist si nécessaire
    return c.json({ message: "Déconnexion réussie" });
  } catch (error) {
    console.error("Erreur lors de la déconnexion:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

export default user;
