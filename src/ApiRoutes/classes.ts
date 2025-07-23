import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import Prisma from "../prisma_adapt";
import { jwt } from "hono/jwt";

// Types pour Cloudflare Workers

const classes = new Hono<{ Bindings: CloudflareBindings }>();

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

// Middleware d'authentification
const authMiddleware = async (c: any, next: () => Promise<void>) => {
  jwt({
    secret: c.env.JWT_SECRET,
  });

  await next();
};

// GET /classes - Récupérer toutes les classes
classes.get(
  "/",
  authMiddleware,
  zValidator("query", querySchema),
  async ({ env, text, req, json }) => {
    const prisma = Prisma(env);
    try {
      const { include, limit, offset, search } = req.valid("query");

      // Configuration des inclusions
      const includeOptions: { Matieres?: { orderBy: { nom: "asc" } } } = {};
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
          where,
          include: includeOptions,
          take: limit,
          skip: offset,
          orderBy: { createdAt: "desc" },
        }),
        prisma.classes.count({ where }),
      ]);

      return json({
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
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la récupération des classes",
        },
        500
      );
    }
  }
);

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
    const includeOptions: { Matieres?: { orderBy: { nom: "asc" } } } = {};
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
  }
});

classes.post(
  "/new",
  authMiddleware,
  zValidator("json", createClasseSchema),
  async ({ json, status, env, req }) => {
    const { nom } = req.valid("json");

    const prisma = Prisma(env);
    try {
      const existingClasse = await prisma.classes.findFirst({
        where: {
          nom: {
            equals: nom,
          },
        },
      });

      if (existingClasse) {
        return json(
          {
            success: false,
            error: "Une classe avec ce nom existe déjà",
          },
          400
        );
      }
      const result = await prisma.classes.create({
        data: {
          nom: nom as string,
        },
        select: {
          nom: true,
          id: true,
        },
      });

      return json(
        {
          success: true,
          data: result,
          message: "Classe créée avec succès",
        },
        201
      );
    } catch (error) {
      console.log(error);

      status(501);
      return json({
        status: "error",
        message: error,
      });
    }
  }
);

// // POST /classes - Créer une nouvelle classe
// classes.post("/", zValidator("json", createClasseSchema), async (c) => {
//   const prisma = Prisma(c.env);

//   try {
//     const data = c.req.valid("json");

//     // Vérifier l'unicité du nom
//     const existingClasse = await prisma.classes.findFirst({
//       where: {
//         nom: {
//           equals: data.nom,
//           mode: "insensitive",
//         },
//       },
//     });

//     if (existingClasse) {
//       return c.json(
//         {
//           success: false,
//           error: "Une classe avec ce nom existe déjà",
//         },
//         400
//       );
//     }

//     const classe = await prisma.classes.create({
//       data: {
//         nom: data.nom,
//       },
//     });

//     return c.json(
//       {
//         success: true,
//         data: classe,
//         message: "Classe créée avec succès",
//       },
//       201
//     );
//   } catch (error) {
//     console.error("Erreur lors de la création de la classe:", error);
//     return c.json(
//       {
//         success: false,
//         error: "Erreur serveur lors de la création de la classe",
//       },
//       500
//     );
//   } finally {
//     await prisma.$disconnect();
//   }
// });

// PUT /classes/:id - Mettre à jour une classe
classes.put(
  "/:id/update",
  zValidator("json", updateClasseSchema),
  async ({ env, json, req }) => {
    const prisma = Prisma(env);

    try {
      const id = req.param("id");
      const data = req.valid("json");

      // Validation de l'ID
      if (!id || typeof id !== "string") {
        return json(
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
          return json(
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

      return json({
        success: true,
        data: classe,
        message: "Classe mise à jour avec succès",
      });
    } catch (error) {
      console.error("Erreur lors de la mise à jour de la classe:", error);
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la mise à jour de la classe",
        },
        500
      );
    }
  }
);

// DELETE /classes/:id - Supprimer une classe
classes.delete(
  "/:id/delete",
  authMiddleware,
  async ({ req, json, status, env }) => {
    const prisma = Prisma(env);

    try {
      const id = req.param("id");

      // Validation de l'ID
      if (!id || typeof id !== "string") {
        return json(
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
        return json(
          {
            success: false,
            error: "Classe non trouvée",
          },
          404
        );
      }

      // Vérifier s'il y a des matières associées
      if (existingClasse.Matieres.length > 0) {
        return json(
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

      return json({
        success: true,
        message: "Classe supprimée avec succès",
      });
    } catch (error) {
      console.error("Erreur lors de la suppression de la classe:", error);
      return json(
        {
          success: false,
          error: "Erreur serveur lors de la suppression de la classe",
        },
        500
      );
    }
  }
);

// // GET /classes/:id/matieres - Récupérer les matières d'une classe
// classes.get("/:id/matieres", zValidator("query", querySchema), async (c) => {
//   const prisma = Prisma(c.env);

//   try {
//     const id = c.req.param("id");
//     const { limit, offset, search } = c.req.valid("query");

//     // Validation de l'ID
//     if (!id || typeof id !== "string") {
//       return c.json(
//         {
//           success: false,
//           error: "ID de classe invalide",
//         },
//         400
//       );
//     }

//     // Vérifier que la classe existe
//     const classe = await prisma.classes.findUnique({
//       where: { id },
//     });

//     if (!classe) {
//       return c.json(
//         {
//           success: false,
//           error: "Classe non trouvée",
//         },
//         404
//       );
//     }

//     // Configuration du filtre de recherche pour les matières
//     const where = {
//       classesId: id,
//       ...(search && {
//         nom: {
//           contains: search,
//           mode: "insensitive",
//         },
//       }),
//     };

//     // Récupération des matières avec pagination
//     const [matieres, total] = await Promise.all([
//       prisma.matieres.findMany({
//         where,
//         take: limit,
//         skip: offset,
//         orderBy: { nom: "asc" },
//       }),
//       prisma.matieres.count({ where }),
//     ]);

//     return c.json({
//       success: true,
//       data: {
//         classe: {
//           id: classe.id,
//           nom: classe.nom,
//         },
//         matieres,
//       },
//       pagination: {
//         total,
//         limit,
//         offset,
//         hasMore: offset + limit < total,
//       },
//     });
//   } catch (error) {
//     console.error("Erreur lors de la récupération des matières:", error);
//     return c.json(
//       {
//         success: false,
//         error: "Erreur serveur lors de la récupération des matières",
//       },
//       500
//     );
//   } finally {
//     await prisma.$disconnect();
//   }
// });

export default classes;

// classes.get("/all", async ({ json, env, text, req, status }) => {
//   const prisma = Prisma(env);

//   try {
//     const result = await prisma.classes.findMany({
//       include: {
//         _count: true,
//       },
//     });
//     return json({
//       status: "All level",
//       result,
//     });
//   } catch (error) {
//     console.log(error);

//     status(501);
//     return json({
//       status: "error",
//       message: error,
//     });
//   }
// });

// classes.get("/unique/:id", async ({ json, env, text, req, status }) => {
//   const prisma = Prisma(env);
//   const { id } = req.param();

//   try {
//     const result = await prisma.classes.findUnique({
//       where: {
//         id: id,
//       },
//       include: {
//         ListeEleves: true,
//         _count: true,
//       },
//     });
//     return json({
//       status: `Level id: ${id}, is find`,
//       result,
//     });
//   } catch (error) {
//     console.log(error);

//     status(501);
//     return json({
//       status: "error",
//       message: error,
//     });
//   }
// });

// classes.get("/unique/:id/eleves", async ({ json, env, text, req, status }) => {
//   const prisma = Prisma(env);
//   const { id } = req.param();

//   try {
//     const result = await prisma.eleves.findMany({
//       where: {
//         classesId: id,
//       },
//     });
//     return json({
//       status: `Level id: ${id}, is find`,
//       result,
//     });
//   } catch (error) {
//     console.log(error);

//     status(501);
//     return json({
//       status: "error",
//       message: error,
//     });
//   }
// });

// classes.put("/unique/:id", async ({ json, env, text, req, status }) => {
//   const prisma = Prisma(env);
//   const { id } = req.param();

//   const request = await req.formData();
//   const getter = {
//     niveau: request.get("niveau") as string,
//     nombreEleves: 30,
//   };

//   try {
//     const result = await prisma.classes.update({
//       where: {
//         id: id,
//       },
//       data: getter,
//     });
//     return json({
//       status: "Level Updated",
//       result,
//     });
//   } catch (error) {
//     console.log(error);

//     status(501);
//     return json({
//       status: "error",
//       message: error,
//     });
//   }
// });

// classes.delete("/unique/:id", async ({ json, env, text, status, req }) => {
//   const prisma = Prisma(env);
//   const { id } = req.param();

//   try {
//     const result = await prisma.classes.delete({
//       where: {
//         id: id,
//       },
//     });
//     return json({
//       status: "Level Deleted",
//       result,
//     });
//   } catch (error) {
//     console.log(error);

//     status(501);
//     return json({
//       status: "error",
//       message: error,
//     });
//   }
// });

// export default classes;
