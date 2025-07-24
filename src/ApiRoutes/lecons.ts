import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import Prisma from "../prisma_adapt";
import authMiddleware from "../authMid";

const lecons = new Hono<{ Bindings: CloudflareBindings }>();

// zod validation
const createLeconSchema = z.object({
  nom: z
    .string()
    .min(1, "Le nom est requis")
    .max(200, "Le nom ne peut pas dépasser 200 caractères")
    .trim(),
  description: z
    .string()
    .max(1000, "La description ne peut pas dépasser 1000 caractères")
    .trim()
    .optional(),
  matieresId: z.string().min(1, "L'ID de la matière est requis"),
});

const updateLeconSchema = z.object({
  nom: z
    .string()
    .min(1, "Le nom est requis")
    .max(200, "Le nom ne peut pas dépasser 200 caractères")
    .trim()
    .optional(),
  description: z
    .string()
    .max(1000, "La description ne peut pas dépasser 1000 caractères")
    .trim()
    .optional(),
  matieresId: z.string().min(1, "L'ID de la matière est requis").optional(),
});

const querySchema = z.object({
  include: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default(50),
  offset: z.string().regex(/^\d+$/).transform(Number).optional().default(0),
  search: z.string().optional(),
  matieresId: z.string().optional(),
  orderBy: z
    .enum(["nom", "createdAt", "updatedAt"])
    .optional()
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
});

const buildIncludeOptions = (include?: string) => {
  const includeOptions: any = {};
  if (include) {
    const includeArray = include.split(",");
    if (includeArray.includes("matieres")) {
      includeOptions.matieres = {
        include: {
          classes: true,
        },
      };
    }
    if (includeArray.includes("souslecons")) {
      includeOptions.SousLecons = {
        orderBy: { createdAt: "asc" },
      };
    }
    if (includeArray.includes("exercices")) {
      includeOptions.Exercices = {
        orderBy: { createdAt: "asc" },
      };
    }
    if (includeArray.includes("utilisateurs")) {
      includeOptions.LeconsUtilisateur = {
        include: {
          utilisateur: {
            select: {
              id: true,
              nom: true,
              email: true,
            },
          },
        },
      };
    }
  }
  return includeOptions;
};

lecons.get(
  "/",
  authMiddleware,
  zValidator("query", querySchema),
  async ({ env, json, req }) => {
    const prisma = Prisma(env);

    try {
      const { include, limit, offset, search, matieresId, orderBy, order } =
        req.valid("query");

      const includeOptions = buildIncludeOptions(include);

      // Configuration des filtres
      const where: any = {};
      if (search) {
        where.OR = [
          {
            nom: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: search,
              mode: "insensitive",
            },
          },
        ];
      }
      if (matieresId) {
        where.matieresId = matieresId;
      }

      // Configuration du tri
      const orderByConfig: any = {};
      orderByConfig[orderBy] = order;

      // Récupération des leçons avec pagination
      const [lecons, total] = await Promise.all([
        prisma.lecons.findMany({
          where,
          include: includeOptions,
          take: limit,
          skip: offset,
          orderBy: orderByConfig,
        }),
        prisma.lecons.count({ where }),
      ]);

      return json({
        success: true,
        data: lecons,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      console.error("Erreur lors de la récupération des leçons:", error);
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la récupération des leçons",
        },
        500
      );
    }
  }
);

// GET /lecons/:id - Récupérer une leçon par ID
lecons.get(
  "/:id",
  authMiddleware,
  zValidator("query", querySchema),
  async ({ json, env, req }) => {
    const prisma = Prisma(env);

    try {
      const id = req.param("id");
      const { include } = req.valid("query");

      // Validation de l'ID
      if (!id || typeof id !== "string") {
        return json(
          {
            success: false,
            error: "ID de leçon invalide",
          },
          400
        );
      }

      const includeOptions = buildIncludeOptions(include);

      const lecon = await prisma.lecons.findUnique({
        where: { id },
        include: includeOptions,
      });

      if (!lecon) {
        return json(
          {
            success: false,
            error: "Leçon non trouvée",
          },
          404
        );
      }

      return json({
        success: true,
        data: lecon,
      });
    } catch (error) {
      console.error("Erreur lors de la récupération de la leçon:", error);
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la récupération de la leçon",
        },
        500
      );
    }
  }
);

// POST /lecons/new - Créer une nouvelle leçon
lecons.post(
  "/new",
  authMiddleware,
  zValidator("json", createLeconSchema),
  async ({ env, json, req }) => {
    const prisma = Prisma(env);

    try {
      const data = req.valid("json");

      // Vérifier que la matière existe
      const matiereExists = await prisma.matieres.findUnique({
        where: { id: data.matieresId },
        include: {
          classes: {
            select: { id: true, nom: true },
          },
        },
      });

      if (!matiereExists) {
        return json(
          {
            success: false,
            error: "La matière spécifiée n'existe pas",
          },
          400
        );
      }

      // Vérifier l'unicité du nom dans la matière
      const existingLecon = await prisma.lecons.findFirst({
        where: {
          nom: {
            equals: data.nom,
            mode: "insensitive",
          },
          matieresId: data.matieresId,
        },
      });

      if (existingLecon) {
        return json(
          {
            success: false,
            error: "Une leçon avec ce nom existe déjà dans cette matière",
          },
          400
        );
      }

      const lecon = await prisma.lecons.create({
        data,
        include: {
          matieres: {
            include: {
              classes: true,
            },
          },
        },
      });

      return json(
        {
          success: true,
          data: lecon,
          message: "Leçon créée avec succès",
        },
        201
      );
    } catch (error) {
      console.error("Erreur lors de la création de la leçon:", error);
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la création de la leçon",
        },
        500
      );
    }
  }
);

export default lecons;
