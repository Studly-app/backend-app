import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import Prisma from "../prisma_adapt";
import authMiddleware from "../authMid";

const sousLecons = new Hono<{ Bindings: CloudflareBindings }>();

// Schémas de validation pour SousLecons
const createSousLeconSchema = z.object({
  nom: z
    .string()
    .min(1, "Le nom est requis")
    .max(200, "Le nom ne peut pas dépasser 200 caractères")
    .trim(),
  description: z
    .string()
    .max(1500, "La description ne peut pas dépasser 1500 caractères")
    .trim()
    .optional(),
  leconsId: z.string().min(1, "L'ID de la leçon est requis"),
});

const updateSousLeconSchema = z.object({
  nom: z
    .string()
    .min(1, "Le nom est requis")
    .max(200, "Le nom ne peut pas dépasser 200 caractères")
    .trim()
    .optional(),
  description: z
    .string()
    .max(1500, "La description ne peut pas dépasser 1500 caractères")
    .trim()
    .optional(),
  leconsId: z.string().min(1, "L'ID de la leçon est requis").optional(),
});

const querySchema = z.object({
  include: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default(50),
  offset: z.string().regex(/^\d+$/).transform(Number).optional().default(0),
  search: z.string().optional(),
  leconsId: z.string().optional(),
  orderBy: z
    .enum(["nom", "createdAt", "updatedAt"])
    .optional()
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("asc"),
});

// Helper pour configurer les inclusions
const buildIncludeOptions = (include?: string) => {
  const includeOptions: any = {};
  if (include) {
    const includeArray = include.split(",");
    if (includeArray.includes("lecons")) {
      includeOptions.lecons = {
        include: {
          matieres: {
            include: {
              classes: true,
            },
          },
        },
      };
    }
    if (includeArray.includes("exercices")) {
      includeOptions.Exercices = {
        orderBy: { createdAt: "asc" },
      };
    }
  }
  return includeOptions;
};

// GET /souslecons - Récupérer toutes les sous-leçons
sousLecons.get(
  "/",
  authMiddleware,
  zValidator("query", querySchema),
  async ({ json, env, req }) => {
    const prisma = Prisma(env);

    try {
      const { include, limit, offset, search, leconsId, orderBy, order } =
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
      if (leconsId) {
        where.leconsId = leconsId;
      }

      // Configuration du tri
      const orderByConfig: any = {};
      orderByConfig[orderBy] = order;

      // Récupération des sous-leçons avec pagination
      const [sousLecons, total] = await Promise.all([
        prisma.sousLecons.findMany({
          where,
          include: includeOptions,
          take: limit,
          skip: offset,
          orderBy: orderByConfig,
        }),
        prisma.sousLecons.count({ where }),
      ]);

      return json({
        success: true,
        data: sousLecons,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      console.error("Erreur lors de la récupération des sous-leçons:", error);
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la récupération des sous-leçons",
        },
        500
      );
    }
  }
);

// GET /souslecons/:id - Récupérer une sous-leçon par ID
sousLecons.get(
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
            error: "ID de sous-leçon invalide",
          },
          400
        );
      }

      const includeOptions = buildIncludeOptions(include);

      const sousLecon = await prisma.sousLecons.findUnique({
        where: { id },
        include: includeOptions,
      });

      if (!sousLecon) {
        return json(
          {
            success: false,
            error: "Sous-leçon non trouvée",
          },
          404
        );
      }

      return json({
        success: true,
        data: sousLecon,
      });
    } catch (error) {
      console.error("Erreur lors de la récupération de la sous-leçon:", error);
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la récupération de la sous-leçon",
        },
        500
      );
    }
  }
);

// POST /souslecons - Créer une nouvelle sous-leçon
sousLecons.post(
  "/new",
  zValidator("json", createSousLeconSchema),
  async ({ json, req, env }) => {
    const prisma = Prisma(env);

    try {
      const data = req.valid("json");

      // Vérifier que la leçon existe
      const leconExists = await prisma.lecons.findUnique({
        where: { id: data.leconsId },
        include: {
          matieres: {
            include: {
              classes: {
                select: { id: true, nom: true },
              },
            },
          },
        },
      });

      if (!leconExists) {
        return json(
          {
            success: false,
            error: "La leçon spécifiée n'existe pas",
          },
          400
        );
      }

      // Vérifier l'unicité du nom dans la leçon
      const existingSousLecon = await prisma.sousLecons.findFirst({
        where: {
          nom: {
            equals: data.nom,
            mode: "insensitive",
          },
          leconsId: data.leconsId,
        },
      });

      if (existingSousLecon) {
        return json(
          {
            success: false,
            error: "Une sous-leçon avec ce nom existe déjà dans cette leçon",
          },
          400
        );
      }

      const sousLecon = await prisma.sousLecons.create({
        data,
        include: {
          lecons: {
            include: {
              matieres: {
                include: {
                  classes: true,
                },
              },
            },
          },
        },
      });

      return json(
        {
          success: true,
          data: sousLecon,
          message: "Sous-leçon créée avec succès",
        },
        201
      );
    } catch (error) {
      console.error("Erreur lors de la création de la sous-leçon:", error);
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la création de la sous-leçon",
        },
        500
      );
    }
  }
);

// PUT /souslecons/:id - Mettre à jour une sous-leçon
sousLecons.put(
  "/:id",
  authMiddleware,
  zValidator("json", updateSousLeconSchema),
  async ({ json, env, req }) => {
    const prisma = Prisma(env);

    try {
      const id = req.param("id");
      const data = req.valid("json");

      // Validation de l'ID
      if (!id || typeof id !== "string") {
        return json(
          {
            success: false,
            error: "ID de sous-leçon invalide",
          },
          400
        );
      }

      // Vérifier que la sous-leçon existe
      const existingSousLecon = await prisma.sousLecons.findUnique({
        where: { id },
      });

      if (!existingSousLecon) {
        return json(
          {
            success: false,
            error: "Sous-leçon non trouvée",
          },
          404
        );
      }

      // Si on change la leçon, vérifier qu'elle existe
      if (data.leconsId && data.leconsId !== existingSousLecon.leconsId) {
        const leconExists = await prisma.lecons.findUnique({
          where: { id: data.leconsId },
        });

        if (!leconExists) {
          return json(
            {
              success: false,
              error: "La leçon spécifiée n'existe pas",
            },
            400
          );
        }
      }

      // Vérifier l'unicité du nom si on le change
      if (data.nom && data.nom !== existingSousLecon.nom) {
        const leconsId = data.leconsId || existingSousLecon.leconsId;
        const duplicateSousLecon = await prisma.sousLecons.findFirst({
          where: {
            nom: {
              equals: data.nom,
              mode: "insensitive",
            },
            leconsId,
            NOT: { id },
          },
        });

        if (duplicateSousLecon) {
          return json(
            {
              success: false,
              error: "Une sous-leçon avec ce nom existe déjà dans cette leçon",
            },
            400
          );
        }
      }

      const sousLecon = await prisma.sousLecons.update({
        where: { id },
        data,
        include: {
          lecons: {
            include: {
              matieres: {
                include: {
                  classes: true,
                },
              },
            },
          },
        },
      });

      return json({
        success: true,
        data: sousLecon,
        message: "Sous-leçon mise à jour avec succès",
      });
    } catch (error) {
      console.error("Erreur lors de la mise à jour de la sous-leçon:", error);
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la mise à jour de la sous-leçon",
        },
        500
      );
    }
  }
);

// DELETE /souslecons/:id - Supprimer une sous-leçon
sousLecons.delete("/:id", authMiddleware, async ({ json, env, req }) => {
  const prisma = Prisma(env);

  try {
    const id = req.param("id");

    // Validation de l'ID
    if (!id || typeof id !== "string") {
      return json(
        {
          success: false,
          error: "ID de sous-leçon invalide",
        },
        400
      );
    }

    // Vérifier que la sous-leçon existe et récupérer les exercices associés
    const existingSousLecon = await prisma.sousLecons.findUnique({
      where: { id },
      include: {
        Exercices: true,
      },
    });

    if (!existingSousLecon) {
      return json(
        {
          success: false,
          error: "Sous-leçon non trouvée",
        },
        404
      );
    }

    // Vérifier s'il y a des exercices associés
    if (existingSousLecon.Exercices.length > 0) {
      return json(
        {
          success: false,
          error: `Impossible de supprimer la sous-leçon car elle contient ${existingSousLecon.Exercices.length} exercice(s)`,
        },
        400
      );
    }

    await prisma.sousLecons.delete({
      where: { id },
    });

    return json({
      success: true,
      message: "Sous-leçon supprimée avec succès",
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la sous-leçon:", error);
    return json(
      {
        success: false,
        error: "Erreur serveur lors de la suppression de la sous-leçon",
      },
      500
    );
  }
});

// GET /souslecons/:id/exercices - Récupérer les exercices d'une sous-leçon
sousLecons.get(
  "/:id/exercices",
  authMiddleware,
  zValidator("query", querySchema),
  async ({ json, env, req }) => {
    const prisma = Prisma(env);

    try {
      const id = req.param("id");
      const { limit, offset, orderBy, order } = req.valid("query");

      // Validation de l'ID
      if (!id || typeof id !== "string") {
        return json(
          {
            success: false,
            error: "ID de sous-leçon invalide",
          },
          400
        );
      }

      // Vérifier que la sous-leçon existe
      const sousLecon = await prisma.sousLecons.findUnique({
        where: { id },
        select: {
          id: true,
          nom: true,
          lecons: {
            select: {
              id: true,
              nom: true,
              matieres: {
                select: {
                  id: true,
                  nom: true,
                },
              },
            },
          },
        },
      });

      if (!sousLecon) {
        return json(
          {
            success: false,
            error: "Sous-leçon non trouvée",
          },
          404
        );
      }

      // Configuration du tri pour les exercices
      const orderByConfig: any = {};
      orderByConfig[orderBy] = order;

      const [exercices, total] = await Promise.all([
        prisma.exercices.findMany({
          where: { sousLeconsId: id },
          take: limit,
          skip: offset,
          orderBy: orderByConfig,
        }),
        prisma.exercices.count({
          where: { sousLeconsId: id },
        }),
      ]);

      return json({
        success: true,
        data: {
          sousLecon,
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
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la récupération des exercices",
        },
        500
      );
    }
  }
);

// GET /lecons/:leconsId/souslecons - Récupérer les sous-leçons d'une leçon
sousLecons.get(
  "/lecons/:leconsId/souslecons",
  zValidator("query", querySchema),
  async ({ json, env, req }) => {
    const prisma = Prisma(env);

    try {
      const leconsId = req.param("leconsId");
      const { include, limit, offset, search, orderBy, order } =
        req.valid("query");

      // Validation de l'ID
      if (!leconsId || typeof leconsId !== "string") {
        return json(
          {
            success: false,
            error: "ID de leçon invalide",
          },
          400
        );
      }

      // Vérifier que la leçon existe
      const lecon = await prisma.lecons.findUnique({
        where: { id: leconsId },
        include: {
          matieres: {
            include: {
              classes: {
                select: { id: true, nom: true },
              },
            },
          },
        },
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

      const includeOptions = buildIncludeOptions(include);

      // Configuration des filtres
      const where: any = { leconsId };
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

      const [sousLecons, total] = await Promise.all([
        prisma.sousLecons.findMany({
          where,
          include: includeOptions,
          take: limit,
          skip: offset,
          orderBy: orderByConfig,
        }),
        prisma.sousLecons.count({ where }),
      ]);

      return json({
        success: true,
        data: {
          lecon: {
            id: lecon.id,
            nom: lecon.nom,
            matieres: lecon.matieres,
          },
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
      console.error(
        "Erreur lors de la récupération des sous-leçons de la leçon:",
        error
      );
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la récupération des sous-leçons",
        },
        500
      );
    }
  }
);

// GET /souslecons/search - Recherche de sous-leçons
sousLecons.get(
  "/search",
  authMiddleware,
  zValidator(
    "query",
    z.object({
      q: z.string().min(1, "Le terme de recherche est requis"),
      leconsId: z.string().optional(),
      matieresId: z.string().optional(),
      limit: z.string().regex(/^\d+$/).transform(Number).optional().default(10),
    })
  ),
  async ({ json, req, env }) => {
    const prisma = Prisma(env);

    try {
      const { q, leconsId, matieresId, limit } = req.valid("query");

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

      if (leconsId) {
        where.leconsId = leconsId;
      }

      if (matieresId && !leconsId) {
        where.lecons = {
          matieresId: matieresId,
        };
      }

      const sousLecons = await prisma.sousLecons.findMany({
        where,
        take: limit,
        orderBy: { nom: "asc" },
        select: {
          id: true,
          nom: true,
          description: true,
          lecons: {
            select: {
              id: true,
              nom: true,
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
            },
          },
          _count: {
            select: {
              Exercices: true,
            },
          },
        },
      });

      return json({
        success: true,
        data: sousLecons,
      });
    } catch (error) {
      console.error("Erreur lors de la recherche de sous-leçons:", error);
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la recherche",
        },
        500
      );
    } finally {
      await prisma.$disconnect();
    }
  }
);

// PUT /souslecons/bulk-update - Mise à jour en lot (réorganisation)
sousLecons.put(
  "/bulk-update",
  zValidator(
    "json",
    z.object({
      updates: z
        .array(
          z.object({
            id: z.string(),
            nom: z.string().optional(),
            description: z.string().optional(),
            leconsId: z.string().optional(),
          })
        )
        .min(1, "Au moins une mise à jour est requise"),
    })
  ),
  async ({ env, json, req }) => {
    const prisma = Prisma(env);

    try {
      const { updates } = req.valid("json");

      // Vérifier que toutes les sous-leçons existent
      const sousLeconIds = updates.map((u) => u.id);
      const existingSousLecons = await prisma.sousLecons.findMany({
        where: { id: { in: sousLeconIds } },
        select: { id: true },
      });

      if (existingSousLecons.length !== updates.length) {
        return json(
          {
            success: false,
            error: "Une ou plusieurs sous-leçons n'existent pas",
          },
          400
        );
      }

      // Effectuer les mises à jour en transaction
      const results = await prisma.$transaction(
        updates.map((update) =>
          prisma.sousLecons.update({
            where: { id: update.id },
            data: {
              ...(update.nom && { nom: update.nom }),
              ...(update.description !== undefined && {
                description: update.description,
              }),
              ...(update.leconsId && { leconsId: update.leconsId }),
            },
          })
        )
      );

      return json({
        success: true,
        data: results,
        message: `${results.length} sous-leçon(s) mise(s) à jour avec succès`,
      });
    } catch (error) {
      console.error("Erreur lors de la mise à jour en lot:", error);
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la mise à jour en lot",
        },
        500
      );
    }
  }
);

export default sousLecons;
