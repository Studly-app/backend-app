import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import Prisma from "../prisma_adapt";

const matieres = new Hono();

interface IncludeOptionsTypes {
  classes?: boolean;
  Lecons?: true;
  Exercices?: boolean;
}

// Schémas de validation
const createMatiereSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  description: z.string().optional(),
  classesId: z.string().min(1, "L'ID de la classe est requis"),
  pointsTotalMatiere: z.number().int().positive().optional(),
  pointsSeuilMatiere: z.number().int().positive().optional(),
});

const updateMatiereSchema = z.object({
  nom: z.string().min(1).optional(),
  description: z.string().optional(),
  classesId: z.string().optional(),
  pointsTotalMatiere: z.number().int().positive().optional(),
  pointsSeuilMatiere: z.number().int().positive().optional(),
});

const querySchema = z.object({
  include: z.string().optional(),
  classesId: z.string().optional(),
  limit: z.string().transform(Number).optional(),
  offset: z.string().transform(Number).optional(),
});

// GET /matieres - Récupérer toutes les matières
matieres.get("/", zValidator("query", querySchema), async (c) => {
  const prisma = Prisma(c.env);
  try {
    const { include, classesId, limit = 50, offset = 0 } = c.req.valid("query");

    const includeOptions: IncludeOptionsTypes = {};
    if (include) {
      const includeArray = include.split(",");
      if (includeArray.includes("classes")) includeOptions.classes = true;
      if (includeArray.includes("lecons")) includeOptions.Lecons = true;
      if (includeArray.includes("exercices")) includeOptions.Exercices = true;
    }

    const where = classesId ? { classesId } : {};

    const matieres = await prisma.matieres.findMany({
      where,
      include: includeOptions,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
    });

    const total = await prisma.matieres.count({ where });

    return c.json({
      success: true,
      data: matieres,
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
  }
});

// GET /matieres/:id - Récupérer une matière par ID
matieres.get("/:id", zValidator("query", querySchema), async (c) => {
  const prisma = Prisma(c.env);
  try {
    const id = c.req.param("id");
    const { include } = c.req.valid("query");

    const includeOptions: IncludeOptionsTypes = {};
    if (include) {
      const includeArray = include.split(",");
      if (includeArray.includes("classes")) includeOptions.classes = true;
      if (includeArray.includes("lecons")) includeOptions.Lecons = true;
      if (includeArray.includes("exercices")) includeOptions.Exercices = true;
    }

    const matiere = await prisma.matieres.findUnique({
      where: { id },
      include: includeOptions,
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

    return c.json({
      success: true,
      data: matiere,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de la matière:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la récupération de la matière",
      },
      500
    );
  }
});

// POST /matieres - Créer une nouvelle matière
matieres.post("/", zValidator("json", createMatiereSchema), async (c) => {
  const prisma = Prisma(c.env);
  try {
    const data = c.req.valid("json");

    // Vérifier que la classe existe
    const classeExists = await prisma.classes.findUnique({
      where: { id: data.classesId },
    });

    if (!classeExists) {
      return c.json(
        {
          success: false,
          error: "La classe spécifiée n'existe pas",
        },
        400
      );
    }

    // Vérifier l'unicité du nom par classe
    const existingMatiere = await prisma.matieres.findFirst({
      where: {
        nom: data.nom,
        classesId: data.classesId,
      },
    });

    if (existingMatiere) {
      return c.json(
        {
          success: false,
          error: "Une matière avec ce nom existe déjà dans cette classe",
        },
        400
      );
    }

    const matiere = await prisma.matieres.create({
      data,
      include: {
        classes: true,
      },
    });

    return c.json(
      {
        success: true,
        data: matiere,
        message: "Matière créée avec succès",
      },
      201
    );
  } catch (error) {
    console.error("Erreur lors de la création de la matière:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la création de la matière",
      },
      500
    );
  }
});

// PUT /matieres/:id - Mettre à jour une matière
matieres.put("/:id", zValidator("json", updateMatiereSchema), async (c) => {
  const prisma = Prisma(c.env);
  try {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    // Vérifier que la matière existe
    const existingMatiere = await prisma.matieres.findUnique({
      where: { id },
    });

    if (!existingMatiere) {
      return c.json(
        {
          success: false,
          error: "Matière non trouvée",
        },
        404
      );
    }

    // Si on change la classe, vérifier qu'elle existe
    if (data.classesId) {
      const classeExists = await prisma.classes.findUnique({
        where: { id: data.classesId },
      });

      if (!classeExists) {
        return c.json(
          {
            success: false,
            error: "La classe spécifiée n'existe pas",
          },
          400
        );
      }
    }

    // Vérifier l'unicité du nom si on le change
    if (data.nom) {
      const classesId = data.classesId || existingMatiere.classesId;
      const duplicateMatiere = await prisma.matieres.findFirst({
        where: {
          nom: data.nom,
          classesId,
          NOT: { id },
        },
      });

      if (duplicateMatiere) {
        return c.json(
          {
            success: false,
            error: "Une matière avec ce nom existe déjà dans cette classe",
          },
          400
        );
      }
    }

    const matiere = await prisma.matieres.update({
      where: { id },
      data,
      include: {
        classes: true,
      },
    });

    return c.json({
      success: true,
      data: matiere,
      message: "Matière mise à jour avec succès",
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la matière:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la mise à jour de la matière",
      },
      500
    );
  }
});

// DELETE /matieres/:id - Supprimer une matière
matieres.delete("/:id", async (c) => {
  const prisma = Prisma(c.env);
  try {
    const id = c.req.param("id");

    // Vérifier que la matière existe
    const existingMatiere = await prisma.matieres.findUnique({
      where: { id },
      include: {
        Lecons: true,
        Exercices: true,
      },
    });

    if (!existingMatiere) {
      return c.json(
        {
          success: false,
          error: "Matière non trouvée",
        },
        404
      );
    }

    // Vérifier s'il y a des leçons ou exercices associés
    if (
      existingMatiere.Lecons.length > 0 ||
      existingMatiere.Exercices.length > 0
    ) {
      return c.json(
        {
          success: false,
          error:
            "Impossible de supprimer la matière car elle contient des leçons ou des exercices",
        },
        400
      );
    }

    await prisma.matieres.delete({
      where: { id },
    });

    return c.json({
      success: true,
      message: "Matière supprimée avec succès",
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la matière:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la suppression de la matière",
      },
      500
    );
  }
});

// GET /matieres/:id/lecons - Récupérer les leçons d'une matière
matieres.get("/:id/lecons", async (c) => {
  const prisma = Prisma(c.env);
  try {
    const id = c.req.param("id");

    const matiere = await prisma.matieres.findUnique({
      where: { id },
      include: {
        Lecons: {
          orderBy: { createdAt: "desc" },
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

    return c.json({
      success: true,
      data: matiere.Lecons,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des leçons:", error);
    return c.json(
      {
        success: false,
        error: "Erreur serveur lors de la récupération des leçons",
      },
      500
    );
  }
});

// GET /matieres/:id/exercices - Récupérer les exercices d'une matière
matieres.get("/:id/exercices", async (c) => {
  const prisma = Prisma(c.env);
  try {
    const id = c.req.param("id");

    const matiere = await prisma.matieres.findUnique({
      where: { id },
      include: {
        Exercices: {
          orderBy: { createdAt: "desc" },
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

    return c.json({
      success: true,
      data: matiere.Exercices,
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

// GET /classes/:classesId/matieres - Récupérer les matières d'une classe
matieres.get(
  "/classes/:classesId/matieres",
  zValidator("query", querySchema),
  async (c) => {
    const prisma = Prisma(c.env);
    try {
      const classesId = c.req.param("classesId");
      const { include, limit = 50, offset = 0 } = c.req.valid("query");

      const includeOptions = {};
      if (include) {
        const includeArray = include.split(",");
        if (includeArray.includes("classes")) includeOptions.classes = true;
        if (includeArray.includes("lecons")) includeOptions.Lecons = true;
        if (includeArray.includes("exercices")) includeOptions.Exercices = true;
      }

      const matieres = await prisma.matieres.findMany({
        where: { classesId },
        include: includeOptions,
        take: limit,
        skip: offset,
        orderBy: { nom: "asc" },
      });

      const total = await prisma.matieres.count({
        where: { classesId },
      });

      return c.json({
        success: true,
        data: matieres,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des matières de la classe:",
        error
      );
      return c.json(
        {
          success: false,
          error: "Erreur serveur lors de la récupération des matières",
        },
        500
      );
    }
  }
);

export default matieres;
