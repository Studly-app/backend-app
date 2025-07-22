import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { cors } from "hono/cors";
import Prisma from "../prisma_adapt";

// Types pour Cloudflare Workers
type Bindings = {
  DATABASE_URL: string;
};

const classes = new Hono<{ Bindings: Bindings }>();

// Schémas de validation pour Classes
const createClasseSchema = z.object({
  nom: z
    .string()
    .min(1, "Le nom est requis")
    .max(100, "Le nom ne peut pas dépasser 100 caractères")
    .trim(),
});

const updateClasseSchema = z.object({
  nom: z
    .string()
    .min(1, "Le nom est requis")
    .max(100, "Le nom ne peut pas dépasser 100 caractères")
    .trim()
    .optional(),
});

const querySchema = z.object({
  include: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default(50),
  offset: z.string().regex(/^\d+$/).transform(Number).optional().default(0),
  search: z.string().optional(),
});

// GET /classes - Récupérer toutes les classes
classes.get("/", zValidator("query", querySchema), async (c) => {
  const prisma = Prisma(c.env);

  try {
    const { include, limit, offset, search } = c.req.valid("query");

    // Configuration des inclusions
    const includeOptions = {};
    if (include) {
      const includeArray = include.split(",");
      if (includeArray.includes("matieres")) {
        includeOptions.Matieres = {
          orderBy: { nom: "asc" },
        };
      }
    }
    // Configuration du filtre de recherche
    const where = search
      ? {
          nom: {
            contains: search,
            mode: "insensitive",
          },
        }
      : {};

    // Récupération des classes avec pagination
    const [classes, total] = await Promise.all([
      prisma.classes.findMany({
        include: includeOptions,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
      }),
      console.log("je suis ici"),
      prisma.classes.count(),
    ]);

    return c.json({
      success: true,
      data: classes,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des classes:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la récupération des classes",
      },
      500
    );
  } finally {
    await prisma.$disconnect();
  }
});

// GET /classes/:id - Récupérer une classe par ID
classes.get("/:id", zValidator("query", querySchema), async (c) => {
  const prisma = Prisma(c.env);

  try {
    const id = c.req.param("id");
    const { include } = c.req.valid("query");

    // Validation de l'ID
    if (!id || typeof id !== "string") {
      return c.json(
        {
          success: false,
          error: "ID de classe invalide",
        },
        400
      );
    }

    // Configuration des inclusions
    const includeOptions = {};
    if (include) {
      const includeArray = include.split(",");
      if (includeArray.includes("matieres")) {
        includeOptions.Matieres = {
          orderBy: { nom: "asc" },
        };
      }
    }

    const classe = await prisma.classes.findUnique({
      where: { id },
      include: includeOptions,
    });

    if (!classe) {
      return c.json(
        {
          success: false,
          error: "Classe non trouvée",
        },
        404
      );
    }

    return c.json({
      success: true,
      data: classe,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de la classe:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la récupération de la classe",
      },
      500
    );
  } finally {
    await prisma.$disconnect();
  }
});

// POST /classes - Créer une nouvelle classe
classes.post("/", zValidator("json", createClasseSchema), async (c) => {
  const prisma = Prisma(c.env);

  try {
    const data = c.req.valid("json");

    // Vérifier l'unicité du nom
    const existingClasse = await prisma.classes.findFirst({
      where: {
        nom: {
          equals: data.nom,
          mode: "insensitive",
        },
      },
    });

    if (existingClasse) {
      return c.json(
        {
          success: false,
          error: "Une classe avec ce nom existe déjà",
        },
        400
      );
    }

    const classe = await prisma.classes.create({
      data: {
        nom: data.nom,
      },
    });

    return c.json(
      {
        success: true,
        data: classe,
        message: "Classe créée avec succès",
      },
      201
    );
  } catch (error) {
    console.error("Erreur lors de la création de la classe:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la création de la classe",
      },
      500
    );
  } finally {
    await prisma.$disconnect();
  }
});

// PUT /classes/:id - Mettre à jour une classe
classes.put("/:id", zValidator("json", updateClasseSchema), async (c) => {
  const prisma = Prisma(c.env);

  try {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    // Validation de l'ID
    if (!id || typeof id !== "string") {
      return c.json(
        {
          success: false,
          error: "ID de classe invalide",
        },
        400
      );
    }

    // Vérifier que la classe existe
    const existingClasse = await prisma.classes.findUnique({
      where: { id },
    });

    if (!existingClasse) {
      return c.json(
        {
          success: false,
          error: "Classe non trouvée",
        },
        404
      );
    }

    // Vérifier l'unicité du nom si on le change
    if (data.nom && data.nom !== existingClasse.nom) {
      const duplicateClasse = await prisma.classes.findFirst({
        where: {
          nom: {
            equals: data.nom,
            mode: "insensitive",
          },
          NOT: { id },
        },
      });

      if (duplicateClasse) {
        return c.json(
          {
            success: false,
            error: "Une classe avec ce nom existe déjà",
          },
          400
        );
      }
    }

    const classe = await prisma.classes.update({
      where: { id },
      data,
    });

    return c.json({
      success: true,
      data: classe,
      message: "Classe mise à jour avec succès",
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la classe:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la mise à jour de la classe",
      },
      500
    );
  } finally {
    await prisma.$disconnect();
  }
});

// DELETE /classes/:id - Supprimer une classe
classes.delete("/:id", async (c) => {
  const prisma = Prisma(c.env);

  try {
    const id = c.req.param("id");

    // Validation de l'ID
    if (!id || typeof id !== "string") {
      return c.json(
        {
          success: false,
          error: "ID de classe invalide",
        },
        400
      );
    }

    // Vérifier que la classe existe et récupérer les matières associées
    const existingClasse = await prisma.classes.findUnique({
      where: { id },
      include: {
        Matieres: true,
      },
    });

    if (!existingClasse) {
      return c.json(
        {
          success: false,
          error: "Classe non trouvée",
        },
        404
      );
    }

    // Vérifier s'il y a des matières associées
    if (existingClasse.Matieres.length > 0) {
      return c.json(
        {
          success: false,
          error: `Impossible de supprimer la classe car elle contient ${existingClasse.Matieres.length} matière(s)`,
        },
        400
      );
    }

    await prisma.classes.delete({
      where: { id },
    });

    return c.json({
      success: true,
      message: "Classe supprimée avec succès",
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la classe:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la suppression de la classe",
      },
      500
    );
  } finally {
    await prisma.$disconnect();
  }
});

// GET /classes/:id/matieres - Récupérer les matières d'une classe
classes.get("/:id/matieres", zValidator("query", querySchema), async (c) => {
  const prisma = Prisma(c.env);

  try {
    const id = c.req.param("id");
    const { limit, offset, search } = c.req.valid("query");

    // Validation de l'ID
    if (!id || typeof id !== "string") {
      return c.json(
        {
          success: false,
          error: "ID de classe invalide",
        },
        400
      );
    }

    // Vérifier que la classe existe
    const classe = await prisma.classes.findUnique({
      where: { id },
    });

    if (!classe) {
      return c.json(
        {
          success: false,
          error: "Classe non trouvée",
        },
        404
      );
    }

    // Configuration du filtre de recherche pour les matières
    const where = {
      classesId: id,
      ...(search && {
        nom: {
          contains: search,
          mode: "insensitive",
        },
      }),
    };

    // Récupération des matières avec pagination
    const [matieres, total] = await Promise.all([
      prisma.matieres.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { nom: "asc" },
      }),
      prisma.matieres.count({ where }),
    ]);

    return c.json({
      success: true,
      data: {
        classe: {
          id: classe.id,
          nom: classe.nom,
        },
        matieres,
      },
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des matières:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la récupération des matières",
      },
      500
    );
  } finally {
    await prisma.$disconnect();
  }
});

// GET /classes/search - Recherche de classes par nom
classes.get(
  "/search",
  zValidator(
    "query",
    z.object({
      q: z.string().min(1, "Le terme de recherche est requis"),
      limit: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .optional()
        .default("10"),
    })
  ),
  async (c) => {
    const prisma = Prisma(c.env);

    try {
      const { q, limit } = c.req.valid("query");

      const classes = await prisma.classes.findMany({
        where: {
          nom: {
            contains: q,
            mode: "insensitive",
          },
        },
        take: limit,
        orderBy: { nom: "asc" },
        select: {
          id: true,
          nom: true,
          _count: {
            select: {
              Matieres: true,
            },
          },
        },
      });

      return c.json({
        success: true,
        data: classes,
      });
    } catch (error) {
      console.error("Erreur lors de la recherche de classes:", error);
      return c.json(
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

// Health check pour Cloudflare Workers
classes.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: "cloudflare-workers",
  });
});

export default classes;
