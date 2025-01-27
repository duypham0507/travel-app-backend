import express, { Express, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import path from "path";
import bodyParser from "body-parser";
import cors from "cors";
import client from "./common/connection";
import userRouter from "@router/user";
import mediaRouter from "@router/media";
import { ValidationError } from "@models/ValidationError";
import morgan from "morgan";
import { DBError } from "@models/DBError";
import YAML from "yamljs";
const swaggerDocument = YAML.load("./swagger.yaml");
import swaggerUi from "swagger-ui-express";
import { MulterError } from "multer";
import { UPLOAD_FOLDER } from "@common/constants";
dotenv.config();

const runServer = async () => {
  const port = process.env.PORT || 3002;

  const app: Express = express();
  await client.connect();
  try {
    app.use(express.static(path.join(__dirname, "assets")));
    app.use(`/${UPLOAD_FOLDER}`, express.static(UPLOAD_FOLDER));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(cors());
    app.use(morgan("combined"));
    app.use((req, res, next) => {
      req.client = client;
      next();
    });
    app.use("/user", userRouter);
    app.use("/media", mediaRouter);

    app.get("/hello", (req, res) => {
      res.json({ mes: "xxx" });
    });
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    app.use(
      (
        error: ValidationError | DBError | MulterError,
        req: Request,
        res: Response,
        next: NextFunction
      ) => {
        console.log(error);
        let errors = [];
        if (error instanceof MulterError) {
          errors.push({ message: "Error upload file" });
        } else {
          errors = error?.getErrorList();
        }
        res.status(400).json({
          errors,
          status: 400,
          message: error.message,
        });
      }
    );

    app.listen(port, () => {
      console.log(`Server is listening on port ${port}`);
    });
  } catch (e) {
    console.log(e);
  }
};

runServer();
