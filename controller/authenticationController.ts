import { Client, DatabaseError, QueryResult } from "pg";
import cryto from "crypto";
import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "@common/constants";
import {
  jsonResponse,
  throwDBError,
  log,
  convertDataToUpdateQuery,
  getFileName,
} from "@helpers/index";
import {
  CreateUserPayload,
  ILoginSocial,
  LoginPayload,
  User,
} from "@models/User";
import { UserDao } from "@daos/UserDao";
import { AUTH_METHOD, PERMISSION } from "@common/enum";
import { DBError } from "@models/DBError";
import { getUserSocialInfo, SocialData } from "@services/socialLogin";
import { signToken } from "@helpers/token";

const authenticationController = {
  login: async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body as LoginPayload;
    const client: Client = req.client;
    const userDao = new UserDao(client);
    try {
      const users: QueryResult<User> = await userDao.getUserByEmailAndMethod(
        email,
        AUTH_METHOD.PASSWORD
      );
      if (users.rowCount === 0) {
        return jsonResponse(
          res,
          "Email or password is incorrect",
          STATUS_CODE.UNAUTHORIZED
        );
      }
      const user = users.rows[0];
      const hashedPassword = cryto
        .pbkdf2Sync(password, user.salt, 1000, 64, "sha512")
        .toString("hex");
      const { password_hash, salt, ...info } = user;

      if (hashedPassword !== password_hash)
        return jsonResponse(
          res,
          "Email or password is incorrect",
          STATUS_CODE.UNAUTHORIZED
        );

      return jsonResponse(res, "Succeed", STATUS_CODE.SUCCESS, {
        accessToken: signToken(info),
      });
    } catch (e) {
      console.log(e);
      return jsonResponse(res, "Unexpected error", STATUS_CODE.BAD_REQUEST);
    }
  },
  signUp: async (req: Request, res: Response, next: NextFunction) => {
    const client: Client = req.client;
    const userDao = new UserDao(client);
    const {
      email,
      password = "",
      info = null,
      mobile = null,
      name,
    } = req.body as CreateUserPayload;
    const avatar = req.file ? getFileName(req.file) : null;

    const salt = cryto.randomBytes(16).toString("hex");

    const hashedPassword = cryto
      .pbkdf2Sync(password, salt, 1000, 64, "sha512")
      .toString("hex");
    try {
      const result = await userDao.signUp({
        email,
        info: info || null,
        mobile: mobile || null,
        name,
        password_hash: hashedPassword,
        avatar,
        permission: PERMISSION.USER,
        method: AUTH_METHOD.PASSWORD,
        salt,
      });
      jsonResponse(res, "Created", STATUS_CODE.CREATED, {});
    } catch (e) {
      throwDBError(e as DatabaseError, next);
    }
  },
  loginSocial: async (req: Request, res: Response, next: NextFunction) => {
    const client: Client = req.client;
    const { accessToken, method } = req.body as ILoginSocial;
    const userDao = new UserDao(client);
    try {
      const data: SocialData = await getUserSocialInfo(accessToken, method);
      const { email } = data;
      const updateUserResult = await userDao.updateOne(
        convertDataToUpdateQuery(data),
        convertDataToUpdateQuery({
          email,
          method,
        }),
        { remainFieldIfNull: true }
      );

      if (updateUserResult.rowCount === 0) {
        const insertedUserResult = await userDao.insertOne({
          ...data,
          permission: PERMISSION.USER,
          method,
        });
        const insertedUser = insertedUserResult.rows[0];
        if (insertedUser) {
          const { password_hash, salt, ...info } = insertedUser;
          return jsonResponse(res, "Succeed", STATUS_CODE.SUCCESS, {
            accessToken: signToken(info),
          });
        } else {
          next(new DBError("Create user failed", []));
        }
      }

      const updatedUser = updateUserResult.rows[0];
      const { password_hash, salt, ...info } = updatedUser;
      return jsonResponse(res, "Succeed", STATUS_CODE.SUCCESS, {
        accessToken: signToken(info),
      });
    } catch (e) {
      log(e);
      next(new DBError("Login social failed", []));
    }
  },
  edit: async (req: Request, res: Response, next: NextFunction) => {
    const client: Client = req.client;
    const userDao = new UserDao(client);
    const {
      info = null,
      mobile = null,
      name = null,
    } = req.body as CreateUserPayload;
    console.log(req.file);

    const avatar = req.file ? getFileName(req.file) : null;
    const curUser = req.user;
    if (!curUser || curUser.method !== AUTH_METHOD.PASSWORD)
      return jsonResponse(res, "Cannot edit user", STATUS_CODE.BAD_REQUEST);
    try {
      const result = await userDao.updateOne(
        [
          { key: "info", value: info || null },
          { key: "mobile", value: mobile || null },
          { key: "name", value: name || null },
          { key: "avatar", value: avatar },
        ],
        [
          {
            key: "id",
            value: curUser.id,
          },
        ],
        {
          remainFieldIfNull: true,
        }
      );
      if (result.rowCount === 0)
        return jsonResponse(res, "User doesn't exist", STATUS_CODE.BAD_REQUEST);
    } catch (e) {
      return jsonResponse(res, "User doesn't exist", STATUS_CODE.BAD_REQUEST);
    }
    return jsonResponse(res, "Edit succeed", STATUS_CODE.SUCCESS);
  },
};

export default authenticationController;
