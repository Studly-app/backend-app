import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import Prisma from "../prisma_adapt";

// Types et interfaces
interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
}

// Configuration de Prisma pour Cloudflare Workers

// Schémas de validation Zod
const createExerciceSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  description: z.string().optional(),
  matieresId: z.string().cuid("ID matière invalide"),
  sousLeconsId: z.string().cuid("ID sous-leçon invalide").optional(),
  leconId: z.string().cuid("ID leçon invalide").optional(),
  typesExercice: z
    .enum(["QCM", "VRAI_FAUX", "COMPLETION", "REDACTION"])
    .default("QCM"),
});

const updateExerciceSchema = z.object({
  nom: z.string().min(1, "Le nom est requis").optional(),
  description: z.string().optional(),
  matieresId: z.string().cuid("ID matière invalide").optional(),
  sousLeconsId: z.string().cuid("ID sous-leçon invalide").optional().nullable(),
  leconId: z.string().cuid("ID leçon invalide").optional().nullable(),
  typesExercice: z.enum(["QCM", "VRAI_FAUX", "COMPLETION"]).optional(),
});

const createOptionQCMSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  description: z.string().optional(),
  exercicesId: z.string().cuid("ID exercice invalide"),
  points: z.number().int().min(0).optional(),
  isCorrect: z.boolean().default(false),
  isSelected: z.boolean().default(false),
});

const updateOptionQCMSchema = z.object({
  nom: z.string().min(1, "Le nom est requis").optional(),
  description: z.string().optional(),
  points: z.number().int().min(0).optional(),
  isCorrect: z.boolean().optional(),
  isSelected: z.boolean().optional(),
});

// Applications Hono
const exercicesApp = new Hono<{ Bindings: CloudflareBindings }>();
const optionsQCMApp = new Hono<{ Bindings: CloudflareBindings }>();

// Middleware d'authentification
const authMiddleware = async (c: any, next: () => Promise<void>) => {
  jwt({
    secret: c.env.JWT_SECRET,
  });

  await next();
};

// ================== ROUTES EXERCICES ==================

// 1. CRÉER UN EXERCICE
exercicesApp.post(
  "/",
  authMiddleware,
  zValidator("json", createExerciceSchema),
  async (c) => {
    try {
      const data = c.req.valid("json");
      const prisma = Prisma(c.env);

      // Vérifier que la matière existe
      const matiere = await prisma.matieres.findUnique({
        where: { id: data.matieresId },
      });

      if (!matiere) {
        return c.json({ error: "Matière non trouvée" }, 404);
      }

      // Vérifier les relations optionnelles
      if (data.sousLeconsId) {
        const sousLecon = await prisma.sousLecons.findUnique({
          where: { id: data.sousLeconsId },
        });
        if (!sousLecon) {
          return c.json({ error: "Sous-leçon non trouvée" }, 404);
        }
      }

      if (data.leconId) {
        const lecon = await prisma.lecons.findUnique({
          where: { id: data.leconId },
        });
        if (!lecon) {
          return c.json({ error: "Leçon non trouvée" }, 404);
        }
      }

      const exercice = await prisma.exercices.create({
        data,
        include: {
          matieres: {
            select: { id: true, nom: true },
          },
          sousLecons: {
            select: { id: true, nom: true },
          },
          lecons: {
            select: { id: true, nom: true },
          },
          _count: {
            select: {
              OptionsQCM: true,
              Reponses: true,
            },
          },
        },
      });

      return c.json(
        {
          message: "Exercice créé avec succès",
          exercice,
        },
        201
      );
    } catch (error) {
      console.error("Erreur lors de la création de l'exercice:", error);
      return c.json({ error: "Erreur serveur" }, 500);
    }
  }
);

// 2. RÉCUPÉRER TOUS LES EXERCICES
exercicesApp.get("/", authMiddleware, async (c) => {
  try {
    const prisma = Prisma(c.env);
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "10");
    const search = c.req.query("search");
    const matieresId = c.req.query("matieresId");
    const leconId = c.req.query("leconId");
    const sousLeconsId = c.req.query("sousLeconsId");
    const typesExercice = c.req.query("typesExercice");
    const skip = (page - 1) * limit;

    const where: any = {};

    // Filtres de recherche
    if (search) {
      where.OR = [
        { nom: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (matieresId) where.matieresId = matieresId;
    if (leconId) where.leconId = leconId;
    if (sousLeconsId) where.sousLeconsId = sousLeconsId;
    if (typesExercice) where.typesExercice = typesExercice;

    const exercices = await prisma.exercices.findMany({
      where,
      include: {
        matieres: {
          select: { id: true, nom: true },
        },
        sousLecons: {
          select: { id: true, nom: true },
        },
        lecons: {
          select: { id: true, nom: true },
        },
        _count: {
          select: {
            OptionsQCM: true,
            Reponses: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    const total = await prisma.exercices.count({ where });

    return c.json({
      exercices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des exercices:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// 3. RÉCUPÉRER UN EXERCICE PAR ID
exercicesApp.get("/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const prisma = Prisma(c.env);
    const includeOptions = c.req.query("includeOptions") === "true";

    const exercice = await prisma.exercices.findUnique({
      where: { id },
      include: {
        matieres: {
          select: { id: true, nom: true },
        },
        sousLecons: {
          select: { id: true, nom: true },
        },
        lecons: {
          select: { id: true, nom: true },
        },
        OptionsQCM: includeOptions
          ? {
              orderBy: { createdAt: "asc" },
            }
          : false,
        _count: {
          select: {
            OptionsQCM: true,
            Reponses: true,
          },
        },
      },
    });

    if (!exercice) {
      return c.json({ error: "Exercice non trouvé" }, 404);
    }

    return c.json(exercice);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'exercice:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// 4. METTRE À JOUR UN EXERCICE
exercicesApp.put(
  "/:id",
  authMiddleware,
  zValidator("json", updateExerciceSchema),
  async (c) => {
    try {
      const id = c.req.param("id");
      const data = c.req.valid("json");
      const prisma = Prisma(c.env);

      // Vérifier si l'exercice existe
      const existingExercice = await prisma.exercices.findUnique({
        where: { id },
      });

      if (!existingExercice) {
        return c.json({ error: "Exercice non trouvé" }, 404);
      }

      // Vérifier les relations si elles sont modifiées
      if (data.matieresId) {
        const matiere = await prisma.matieres.findUnique({
          where: { id: data.matieresId },
        });
        if (!matiere) {
          return c.json({ error: "Matière non trouvée" }, 404);
        }
      }

      if (data.sousLeconsId) {
        const sousLecon = await prisma.sousLecons.findUnique({
          where: { id: data.sousLeconsId },
        });
        if (!sousLecon) {
          return c.json({ error: "Sous-leçon non trouvée" }, 404);
        }
      }

      if (data.leconId) {
        const lecon = await prisma.lecons.findUnique({
          where: { id: data.leconId },
        });
        if (!lecon) {
          return c.json({ error: "Leçon non trouvée" }, 404);
        }
      }

      const updatedExercice = await prisma.exercices.update({
        where: { id },
        data,
        include: {
          matieres: {
            select: { id: true, nom: true },
          },
          sousLecons: {
            select: { id: true, nom: true },
          },
          lecons: {
            select: { id: true, nom: true },
          },
          _count: {
            select: {
              OptionsQCM: true,
              Reponses: true,
            },
          },
        },
      });

      return c.json({
        message: "Exercice mis à jour avec succès",
        exercice: updatedExercice,
      });
    } catch (error) {
      console.error("Erreur lors de la mise à jour de l'exercice:", error);
      return c.json({ error: "Erreur serveur" }, 500);
    }
  }
);

// 5. SUPPRIMER UN EXERCICE
exercicesApp.delete("/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const prisma = Prisma(c.env);

    const exercice = await prisma.exercices.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            OptionsQCM: true,
            Reponses: true,
          },
        },
      },
    });

    if (!exercice) {
      return c.json({ error: "Exercice non trouvé" }, 404);
    }

    // Supprimer l'exercice (les relations seront supprimées en cascade)
    await prisma.exercices.delete({
      where: { id },
    });

    return c.json({
      message: "Exercice supprimé avec succès",
      deletedRelations: {
        options: exercice._count.OptionsQCM,
        reponses: exercice._count.Reponses,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de l'exercice:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// ================== ROUTES OPTIONS QCM ==================

// 1. CRÉER UNE OPTION QCM
optionsQCMApp.post(
  "/",
  authMiddleware,
  zValidator("json", createOptionQCMSchema),
  async (c) => {
    try {
      const data = c.req.valid("json");
      const prisma = Prisma(c.env);

      // Vérifier que l'exercice existe et est de type QCM
      const exercice = await prisma.exercices.findUnique({
        where: { id: data.exercicesId },
      });

      if (!exercice) {
        return c.json({ error: "Exercice non trouvé" }, 404);
      }

      if (exercice.typesExercice !== "QCM") {
        return c.json({ error: "Cet exercice n'est pas de type QCM" }, 400);
      }

      const option = await prisma.optionsQCM.create({
        data,
        include: {
          exercices: {
            select: { id: true, nom: true, typesExercice: true },
          },
        },
      });

      return c.json(
        {
          message: "Option QCM créée avec succès",
          option,
        },
        201
      );
    } catch (error) {
      console.error("Erreur lors de la création de l'option QCM:", error);
      return c.json({ error: "Erreur serveur" }, 500);
    }
  }
);

// 2. RÉCUPÉRER TOUTES LES OPTIONS D'UN EXERCICE
optionsQCMApp.get("/exercice/:exerciceId", authMiddleware, async (c) => {
  try {
    const exerciceId = c.req.param("exerciceId");
    const prisma = Prisma(c.env);

    // Vérifier que l'exercice existe
    const exercice = await prisma.exercices.findUnique({
      where: { id: exerciceId },
    });

    if (!exercice) {
      return c.json({ error: "Exercice non trouvé" }, 404);
    }

    const options = await prisma.optionsQCM.findMany({
      where: { exercicesId: exerciceId },
      include: {
        exercices: {
          select: { id: true, nom: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return c.json({
      options,
      exercice: {
        id: exercice.id,
        nom: exercice.nom,
        typesExercice: exercice.typesExercice,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des options:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// 3. RÉCUPÉRER UNE OPTION PAR ID
optionsQCMApp.get("/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const prisma = Prisma(c.env);

    const option = await prisma.optionsQCM.findUnique({
      where: { id },
      include: {
        exercices: {
          select: { id: true, nom: true, typesExercice: true },
        },
      },
    });

    if (!option) {
      return c.json({ error: "Option QCM non trouvée" }, 404);
    }

    return c.json(option);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'option:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// 4. METTRE À JOUR UNE OPTION QCM
optionsQCMApp.put(
  "/:id",
  authMiddleware,
  zValidator("json", updateOptionQCMSchema),
  async (c) => {
    try {
      const id = c.req.param("id");
      const data = c.req.valid("json");
      const prisma = Prisma(c.env);

      const existingOption = await prisma.optionsQCM.findUnique({
        where: { id },
      });

      if (!existingOption) {
        return c.json({ error: "Option QCM non trouvée" }, 404);
      }

      const updatedOption = await prisma.optionsQCM.update({
        where: { id },
        data,
        include: {
          exercices: {
            select: { id: true, nom: true, typesExercice: true },
          },
        },
      });

      return c.json({
        message: "Option QCM mise à jour avec succès",
        option: updatedOption,
      });
    } catch (error) {
      console.error("Erreur lors de la mise à jour de l'option:", error);
      return c.json({ error: "Erreur serveur" }, 500);
    }
  }
);

// 5. SUPPRIMER UNE OPTION QCM
optionsQCMApp.delete("/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    const prisma = Prisma(c.env);

    const option = await prisma.optionsQCM.findUnique({
      where: { id },
    });

    if (!option) {
      return c.json({ error: "Option QCM non trouvée" }, 404);
    }

    await prisma.optionsQCM.delete({
      where: { id },
    });

    return c.json({ message: "Option QCM supprimée avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression de l'option:", error);
    return c.json({ error: "Erreur serveur" }, 500);
  }
});

// 6. CRÉER PLUSIEURS OPTIONS EN UNE FOIS
optionsQCMApp.post(
  "/bulk",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      exercicesId: z.string().cuid("ID exercice invalide"),
      options: z
        .array(
          z.object({
            nom: z.string().min(1, "Le nom est requis"),
            description: z.string().optional(),
            points: z.number().int().min(0).optional(),
            isCorrect: z.boolean().default(false),
          })
        )
        .min(1, "Au moins une option est requise"),
    })
  ),
  async (c) => {
    try {
      const { exercicesId, options } = c.req.valid("json");
      const prisma = Prisma(c.env);

      // Vérifier que l'exercice existe et est de type QCM
      const exercice = await prisma.exercices.findUnique({
        where: { id: exercicesId },
      });

      if (!exercice) {
        return c.json({ error: "Exercice non trouvé" }, 404);
      }

      if (exercice.typesExercice !== "QCM") {
        return c.json({ error: "Cet exercice n'est pas de type QCM" }, 400);
      }

      // Créer toutes les options
      const createdOptions = await prisma.$transaction(
        options.map((option) =>
          prisma.optionsQCM.create({
            data: {
              ...option,
              exercicesId,
              isSelected: false,
            },
          })
        )
      );

      return c.json(
        {
          message: `${createdOptions.length} options QCM créées avec succès`,
          options: createdOptions,
        },
        201
      );
    } catch (error) {
      console.error("Erreur lors de la création en lot des options:", error);
      return c.json({ error: "Erreur serveur" }, 500);
    }
  }
);

// 7. MARQUER/DÉMARQUER UNE OPTION COMME SÉLECTIONNÉE
optionsQCMApp.patch(
  "/:id/select",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      isSelected: z.boolean(),
    })
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const { isSelected } = c.req.valid("json");
      const prisma = Prisma(c.env);

      const option = await prisma.optionsQCM.findUnique({
        where: { id },
      });

      if (!option) {
        return c.json({ error: "Option QCM non trouvée" }, 404);
      }

      const updatedOption = await prisma.optionsQCM.update({
        where: { id },
        data: { isSelected },
        include: {
          exercices: {
            select: { id: true, nom: true },
          },
        },
      });

      return c.json({
        message: `Option ${
          isSelected ? "sélectionnée" : "désélectionnée"
        } avec succès`,
        option: updatedOption,
      });
    } catch (error) {
      console.error("Erreur lors de la sélection de l'option:", error);
      return c.json({ error: "Erreur serveur" }, 500);
    }
  }
);

// Monter les sous-applications
export { optionsQCMApp, exercicesApp };
