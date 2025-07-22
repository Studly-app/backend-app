-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nom" TEXT,
    "prenom" TEXT,
    "password" TEXT NOT NULL,
    "dataInscription" TEXT,
    "derniereConnexion" DATETIME,
    "typesUtilisateur" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Matieres" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "classesId" TEXT NOT NULL,
    "pointsTotalMatiere" INTEGER,
    "pointsSeuilMatiere" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Matieres_classesId_fkey" FOREIGN KEY ("classesId") REFERENCES "Classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lecons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "matieresId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lecons_matieresId_fkey" FOREIGN KEY ("matieresId") REFERENCES "Matieres" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SousLecons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "leconsId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SousLecons_leconsId_fkey" FOREIGN KEY ("leconsId") REFERENCES "Lecons" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exercices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "matieresId" TEXT NOT NULL,
    "sousLeconsId" TEXT,
    "leconId" TEXT,
    "typesExercice" TEXT NOT NULL DEFAULT 'QCM',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Exercices_sousLeconsId_fkey" FOREIGN KEY ("sousLeconsId") REFERENCES "SousLecons" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Exercices_matieresId_fkey" FOREIGN KEY ("matieresId") REFERENCES "Matieres" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Exercices_leconId_fkey" FOREIGN KEY ("leconId") REFERENCES "Lecons" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptionsQCM" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "exercicesId" TEXT NOT NULL,
    "points" INTEGER,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OptionsQCM_exercicesId_fkey" FOREIGN KEY ("exercicesId") REFERENCES "Exercices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeconsUtilisateur" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leconsId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeconsUtilisateur_leconsId_fkey" FOREIGN KEY ("leconsId") REFERENCES "Lecons" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeconsUtilisateur_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reponses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "exercicesId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reponses_exercicesId_fkey" FOREIGN KEY ("exercicesId") REFERENCES "Exercices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReponsesUtilisateur" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reponsesId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReponsesUtilisateur_reponsesId_fkey" FOREIGN KEY ("reponsesId") REFERENCES "Reponses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReponsesUtilisateur_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
