const db = require("../models");
const ServiceAccount = db.service_account;
const User = db.user;
const crypto = require('crypto');

exports.create = async (req, res) => {
  try {
    const { description, expirationDays } = req.body;
    const userId = req.userId;

    const user = await User.findByPk(userId);
    const username = `${user.username}-${crypto.randomBytes(4).toString('hex')}`;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);

    const serviceAccount = await ServiceAccount.create({
      username,
      token,
      expiresAt,
      description,
      userId
    });

    res.status(201).send(serviceAccount);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

exports.findAll = async (req, res) => {
  try {
    const userId = req.userId;
    const serviceAccounts = await ServiceAccount.findAll({ where: { userId } });
    res.send(serviceAccounts);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const deleted = await ServiceAccount.destroy({ where: { id, userId } });

    if (deleted) {
      res.send({ message: "Service account deleted successfully." });
    } else {
      res.status(404).send({ message: "Service account not found." });
    }
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};