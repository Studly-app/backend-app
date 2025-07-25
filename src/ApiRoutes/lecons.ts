import { Hono } from "hono";
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

// PUT /lecons/:id - Mettre à jour une leçon
lecons.put(
  "/lecons/:id",
  authMiddleware,
  zValidator("json", updateLeconSchema),
  async (c) => {
    const prisma = Prisma(c.env);

    try {
      const id = c.req.param("id");
      const data = c.req.valid("json");

      // Validation de l'ID
      if (!id || typeof id !== "string") {
        return c.json(
          {
            success: false,
            error: "ID de leçon invalide",
          },
          400
        );
      }

      // Vérifier que la leçon existe
      const existingLecon = await prisma.lecons.findUnique({
        where: { id },
      });

      if (!existingLecon) {
        return c.json(
          {
            success: false,
            error: "Leçon non trouvée",
          },
          404
        );
      }

      // Si on change la matière, vérifier qu'elle existe
      if (data.matieresId && data.matieresId !== existingLecon.matieresId) {
        const matiereExists = await prisma.matieres.findUnique({
          where: { id: data.matieresId },
        });

        if (!matiereExists) {
          return c.json(
            {
              success: false,
              error: "La matière spécifiée n'existe pas",
            },
            400
          );
        }
      }

      // Vérifier l'unicité du nom si on le change
      if (data.nom && data.nom !== existingLecon.nom) {
        const matieresId = data.matieresId || existingLecon.matieresId;
        const duplicateLecon = await prisma.lecons.findFirst({
          where: {
            nom: {
              equals: data.nom,
              mode: "insensitive",
            },
            matieresId,
            NOT: { id },
          },
        });

        if (duplicateLecon) {
          return c.json(
            {
              success: false,
              error: "Une leçon avec ce nom existe déjà dans cette matière",
            },
            400
          );
        }
      }

      const lecon = await prisma.lecons.update({
        where: { id },
        data,
        include: {
          matieres: {
            include: {
              classes: true,
            },
          },
        },
      });

      return c.json({
        success: true,
        data: lecon,
        message: "Leçon mise à jour avec succès",
      });
    } catch (error) {
      console.error("Erreur lors de la mise à jour de la leçon:", error);
      return c.json(
        {
          success: false,
          error: "Erreur serveur lors de la mise à jour de la leçon",
        },
        500
      );
    }
  }
);

// DELETE /lecons/:id - Supprimer une leçon
lecons.delete("/lecons/:id", async (c) => {
  const prisma = Prisma(c.env);

  try {
    const id = c.req.param("id");

    // Validation de l'ID
    if (!id || typeof id !== "string") {
      return c.json(
        {
          success: false,
          error: "ID de leçon invalide",
        },
        400
      );
    }

    // Vérifier que la leçon existe et récupérer les données associées
    const existingLecon = await prisma.lecons.findUnique({
      where: { id },
      include: {
        SousLecons: true,
        Exercices: true,
        LeconsUtilisateur: true,
      },
    });

    if (!existingLecon) {
      return c.json(
        {
          success: false,
          error: "Leçon non trouvée",
        },
        404
      );
    }

    // Vérifier s'il y a des données associées
    const hasRelatedData =
      existingLecon.SousLecons.length > 0 ||
      existingLecon.Exercices.length > 0 ||
      existingLecon.LeconsUtilisateur.length > 0;

    if (hasRelatedData) {
      return c.json(
        {
          success: false,
          error:
            "Impossible de supprimer la leçon car elle contient des sous-leçons, exercices ou est utilisée par des utilisateurs",
        },
        400
      );
    }

    await prisma.lecons.delete({
      where: { id },
    });

    return c.json({
      success: true,
      message: "Leçon supprimée avec succès",
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la leçon:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la suppression de la leçon",
      },
      500
    );
  }
});

// GET /lecons/:id/souslecons - Récupérer les sous-leçons d'une leçon
lecons.get(
  "/lecons/:id/souslecons",
  authMiddleware,
  zValidator("query", querySchema),
  async (c) => {
    const prisma = Prisma(c.env);

    try {
      const id = c.req.param("id");
      const { limit, offset } = c.req.valid("query");

      // Validation de l'ID
      if (!id || typeof id !== "string") {
        return c.json(
          {
            success: false,
            error: "ID de leçon invalide",
          },
          400
        );
      }

      // Vérifier que la leçon existe
      const lecon = await prisma.lecons.findUnique({
        where: { id },
        select: { id: true, nom: true },
      });

      if (!lecon) {
        return c.json(
          {
            success: false,
            error: "Leçon non trouvée",
          },
          404
        );
      }

      const [sousLecons, total] = await Promise.all([
        prisma.sousLecons.findMany({
          where: { leconsId: id },
          take: limit,
          skip: offset,
          orderBy: { createdAt: "asc" },
        }),
        prisma.sousLecons.count({
          where: { leconsId: id },
        }),
      ]);

      return c.json({
        success: true,
        data: {
          lecon,
          sousLecons,
        },
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      console.error("Erreur lors de la récupération des sous-leçons:", error);
      return c.json(
        {
          success: false,
          error: "Erreur serveur lors de la récupération des sous-leçons",
        },
        500
      );
    }
  }
);

// GET /lecons/:id/exercices - Récupérer les exercices d'une leçon
lecons.get("/:id/exercices", zValidator("query", querySchema), async (c) => {
  const prisma = Prisma(c.env);

  try {
    const id = c.req.param("id");
    const { limit, offset } = c.req.valid("query");

    // Validation de l'ID
    if (!id || typeof id !== "string") {
      return c.json(
        {
          success: false,
          error: "ID de leçon invalide",
        },
        400
      );
    }

    // Vérifier que la leçon existe
    const lecon = await prisma.lecons.findUnique({
      where: { id },
      select: { id: true, nom: true },
    });

    if (!lecon) {
      return c.json(
        {
          success: false,
          error: "Leçon non trouvée",
        },
        404
      );
    }

    const [exercices, total] = await Promise.all([
      prisma.exercices.findMany({
        where: { leconId: id },
        take: limit,
        skip: offset,
        orderBy: { createdAt: "asc" },
      }),
      prisma.exercices.count({
        where: { leconId: id },
      }),
    ]);

    return c.json({
      success: true,
      data: {
        lecon,
        exercices,
      },
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des exercices:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la récupération des exercices",
      },
      500
    );
  }
});

// GET /matieres/:matieresId/lecons - Récupérer les leçons d'une matière
lecons.get(
  "/matieres/:matieresId/lecons",
  authMiddleware,
  zValidator("query", querySchema),
  async (c) => {
    const prisma = Prisma(c.env);

    try {
      const matieresId = c.req.param("matieresId");
      const { include, limit, offset, search, orderBy, order } =
        c.req.valid("query");

      // Validation de l'ID
      if (!matieresId || typeof matieresId !== "string") {
        return c.json(
          {
            success: false,
            error: "ID de matière invalide",
          },
          400
        );
      }

      // Vérifier que la matière existe
      const matiere = await prisma.matieres.findUnique({
        where: { id: matieresId },
        include: {
          classes: {
            select: { id: true, nom: true },
          },
        },
      });

      if (!matiere) {
        return c.json(
          {
            success: false,
            error: "Matière non trouvée",
          },
          404
        );
      }

      const includeOptions = buildIncludeOptions(include);

      // Configuration des filtres
      const where: any = { matieresId };
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

      // Configuration du tri
      const orderByConfig: any = {};
      orderByConfig[orderBy] = order;

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

      return c.json({
        success: true,
        data: {
          matiere: {
            id: matiere.id,
            nom: matiere.nom,
            classes: matiere.classes,
          },
          lecons,
        },
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des leçons de la matière:",
        error
      );
      return c.json(
        {
          success: false,
          error: "Erreur serveur lors de la récupération des leçons",
        },
        500
      );
    }
  }
);

// GET /lecons/search - Recherche de leçons
lecons.get(
  "/search",
  authMiddleware,
  zValidator(
    "query",
    z.object({
      q: z.string().min(1, "Le terme de recherche est requis"),
      matieresId: z.string().optional(),
      limit: z.string().regex(/^\d+$/).transform(Number).optional().default(10),
    })
  ),
  async (c) => {
    const prisma = Prisma(c.env);

    try {
      const { q, matieresId, limit } = c.req.valid("query");

      const where: any = {
        OR: [
          {
            nom: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: q,
              mode: "insensitive",
            },
          },
        ],
      };

      if (matieresId) {
        where.matieresId = matieresId;
      }

      const lecons = await prisma.lecons.findMany({
        where,
        take: limit,
        orderBy: { nom: "asc" },
        select: {
          id: true,
          nom: true,
          description: true,
          matieres: {
            select: {
              id: true,
              nom: true,
              classes: {
                select: {
                  id: true,
                  nom: true,
                },
              },
            },
          },
          _count: {
            select: {
              SousLecons: true,
              Exercices: true,
            },
          },
        },
      });

      return c.json({
        success: true,
        data: lecons,
      });
    } catch (error) {
      console.error("Erreur lors de la recherche de leçons:", error);
      return c.json(
        {
          success: false,
          error: "Erreur serveur lors de la recherche",
        },
        500
      );
    }
  }
);

export default lecons;
