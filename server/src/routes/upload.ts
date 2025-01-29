import express, { Request, Response } from "express";
import s3 from "../config/aws";
import { userAuth } from "../middleware/auth";
import Prisma from "../PrismaInit";

const UploadRouter = express.Router();

// Upload File
UploadRouter.post(
  "/upload",
  userAuth,
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { fileName, fileType, fileSize, folderName } = req.body;
      //@ts-expect-error
      const userId = req.user?.userId; // Ensure userId is available

      if (!fileName || !fileType || !fileSize) {
        return res
          .status(400)
          .json({ error: "fileName, fileType, and fileSize are required" });
      }

      let s3Key;
      let folderId: string | null = null;

      if (folderName !== "" && folderName !== undefined) {
        s3Key = `${userId}/${folderName}/${fileName}`;

        // Check if the folder already exists
        let existingFolder = await Prisma.folder.findFirst({
          where: { name: folderName, ownerId: userId },
        });

        // If folder does not exist, create it
        if (!existingFolder) {
          existingFolder = await Prisma.folder.create({
            data: {
              name: folderName,
              ownerId: userId,
              path: `${userId}/${folderName}`,
            },
          });
        }

        folderId = existingFolder.folderId; // Store folder ID
      } else {
        s3Key = `${userId}/${fileName}`;
      }

      // Store metadata in the database
      const newFile = await Prisma.file.create({
        data: {
          name: fileName,
          type: fileType,
          key: s3Key,
          size: fileSize,
          ownerId: userId,
          access: false,
          status: "pending",
          folderId, // Link file to folder if folder exists
        },
      });

      // Generate Pre-Signed URL
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Expires: 60,
        ContentType: fileType,
      };

      const url = await s3.getSignedUrlPromise("putObject", params);

      res.status(200).json({ url, fileId: newFile.fileId, filePath: s3Key });
    } catch (err: any) {
      console.error("Error generating pre-signed URL:", err);
      res.status(500).json({
        error: "Failed to generate pre-signed URL",
        details: err.message,
      });
    }
  }
);

// Update File Status After Upload
UploadRouter.post(
  "/file-uploaded",
  userAuth,
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { fileId, status } = req.body;

      if (!fileId || status === undefined) {
        return res
          .status(400)
          .json({ error: "fileId and status are required" });
      }

      await Prisma.file.update({
        where: { fileId },
        data: { status: "upload" },
      });

      res.status(200).json({ message: "File metadata updated successfully" });
    } catch (err: any) {
      console.error("Error updating file metadata:", err);
      res.status(500).json({ error: "Failed to update file metadata" });
    }
  }
);

// Create a "Folder" in S3
UploadRouter.post(
  "/create-folder",
  userAuth,
  async (req, res): Promise<any> => {
    try {
      const { folderName } = req.body;
      //@ts-expect-error
      const userId = req.user?.userId;

      if (!folderName) {
        return res.status(400).json({ error: "folderName is required" });
      }

      const s3Key = `${userId}/${folderName}/`; // Folder path

      // Creating an empty object with the folder path
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: "", // Empty body to simulate the folder
      };

      await s3.putObject(params).promise();

      // Save folder details in database
      const newFolder = await Prisma.folder.create({
        data: {
          name: folderName,
          ownerId: userId,
          path: s3Key, // Store folder path
        },
      });

      res.status(200).json({
        message: `Folder "${folderName}" created successfully!`,
        folder: newFolder,
      });
    } catch (err: any) {
      console.error("Error creating folder:", err);
      res.status(500).json({
        error: "Failed to create folder",
        details: err.message,
      });
    }
  }
);

export default UploadRouter;
