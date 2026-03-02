import argon2 from "argon2";
import { MongoClient, ObjectId } from "mongodb";
import express from "express";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
const p = express();
p.use(express.json());
p.use(cookieParser());
const client = new MongoClient("mongodb+srv://gleb:GPetrov1303@cluster0.fzb5rxf.mongodb.net/?appName=Cluster0");
const startServer = async () => {
    try {
        await client.connect();
        const db = client.db("users");
        const users = db.collection("users");
        const orders = db.collection("orders");
        const products = db.collection("z");
        const contact = db.collection("contact");
        p.get("/all", async (req, res) => {
            const { type, forSome, season, sex, material, page } = req.query;
            const filters = {
                type: type,
                forSome: forSome,
                season: season,
                sex: sex,
                material: material,
            };
            Object.keys(filters).forEach((key) => {
                const k = key;
                if (!filters[k]) {
                    delete filters[k];
                }
            });
            if (page) {
                const skip = parseInt(page) * 15;
                const limit = 15;
                const d = await products
                    .find(filters)
                    .sort({ _id: -1 })
                    .skip(skip)
                    .limit(limit)
                    .toArray();
                res.json(d);
            }
            else {
                const d = await products
                    .find(filters)
                    .sort({ _id: -1 })
                    .limit(15)
                    .toArray();
                const length = await products.countDocuments(filters);
                res.json({ data: d, count: length / 15 });
            }
        });
        p.get("/product/:id", async (req, res) => {
            const { id } = req.params;
            const d = await products.findOne({ _id: new ObjectId(id) });
            res.json(d);
        });
        p.post("/singup", async (req, res) => {
            try {
                const { name, email, password, } = req.body;
                const existingUser = await users.findOne({ email });
                if (existingUser) {
                    return res
                        .status(400)
                        .json({ message: "Пользователь уже существует" });
                }
                const hash = await argon2.hash(password);
                users.insertOne({ name, email, password: hash });
                res
                    .status(201)
                    .json({ message: "Пользователь успешно зарегистрирован" });
            }
            catch (error) {
                console.error("Ошибка при регистрации:", error);
                res.status(500).json({ message: "Ошибка при регистрации" });
            }
        });
        p.post("/login", async (req, res) => {
            try {
                const { email, password } = req.body;
                const user = await users.findOne({ email });
                if (!user) {
                    return res.status(400).json({ message: "Пользователь не найден" });
                }
                const validPassword = await argon2.verify(user.password, password);
                if (!validPassword) {
                    return res.status(400).json({ message: "Неверный пароль" });
                }
                const accessToken = jwt.sign({ userid: user._id }, "dfdfsdfsfsdfwef38y87e?+-#ddsfsdf", { expiresIn: "15m" });
                const refreshToken = jwt.sign({ userid: user._id }, "dfdfsdfsfsdfwef38y87e?+-#ddsfsdf", { expiresIn: "20d" });
                users.updateOne({ _id: user._id }, { $set: { refreshToken } });
                res.cookie("refreshToken", refreshToken, {
                    httpOnly: true,
                    secure: true,
                    sameSite: "strict",
                });
                res.json({ accessToken });
            }
            catch (error) {
                console.error("Ошибка при входе:", error);
                res.status(500).json({ message: "Ошибка при входе" });
            }
        });
        p.post("/refresh", async (req, res) => {
            try {
                const refreshToken = req.cookies.refreshToken;
                if (!refreshToken) {
                    return res.status(401).json({ message: "Нет refresh токена" });
                }
                jwt.verify(refreshToken, "dfdfsdfsfsdfwef38y87e?+-#ddsfsdf", (err, decoded) => {
                    if (err) {
                        return res
                            .status(401)
                            .json({ message: "Неверный refresh токен" });
                    }
                    const accessToken = jwt.sign({ userid: decoded.userid }, "dfdfsdfsfsdfwef38y87e?+-#ddsfsdf", { expiresIn: "15m" });
                    res.json({ accessToken });
                });
            }
            catch (error) {
                console.error("Ошибка при обновлении токена:", error);
                res.status(500).json({ message: "Ошибка при обновлении токена" });
            }
        });
        p.post("/logout", async (req, res) => {
            try {
                const refreshToken = req.cookies.refreshToken;
                if (!refreshToken) {
                    return res.status(400).json({ message: "Нет refresh токена" });
                }
                const user = await users.findOne({ refreshToken });
                if (user) {
                    await users.updateOne({ _id: user._id }, { $set: { refreshToken: null } });
                }
                res.clearCookie("refreshToken");
                res.status(200).json({ message: "Успешный выход" });
            }
            catch (error) {
                console.error("Ошибка при выходе:", error);
                res.status(500).json({ message: "Ошибка при выходе" });
            }
        });
        p.post("/contact", async (req, res) => {
            try {
                contact.insertOne(req.body);
                res.status(201).json({ message: "Сообщение успешно отправлено" });
            }
            catch (error) {
                console.error("Ошибка при отправке сообщения:", error);
                res.status(500).json({ message: "Ошибка при отправке сообщения" });
            }
        });
        p.get("/orders", async (req, res) => {
            try {
                const authHeader = req.headers.authorization;
                const accessToken = authHeader && authHeader.split(" ")[1];
                if (!accessToken) {
                    return res.status(401).json({ message: "Нет access токена" });
                }
                jwt.verify(accessToken, "dfdfsdfsfsdfwef38y87e?+-#ddsfsdf", async (err, decoded) => {
                    if (err) {
                        return res.status(401).json({ message: "Неверный access токен" });
                    }
                    const userOrders = await orders
                        .find({ userId: new ObjectId(decoded.userid) })
                        .toArray();
                    res.json(userOrders);
                });
            }
            catch (error) {
                console.error("Ошибка при получении заказов:", error);
                res.status(500).json({ message: "Ошибка при получении заказов" });
            }
        });
    }
    catch (error) {
        console.error("Ошибка подключения к MongoDB:", error);
    }
};
startServer();
p.listen(4567, () => {
    console.log(`Сервер запущен на http://localhost:${4567}`);
});
