const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword
    });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      status: "success",
      user: { id: user._id, name: user.name, email: user.email },
      token
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      status: "success",
      user: { id: user._id, name: user.name, email: user.email, image: user.image },
      token
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const cloudinary = require('../config/cloudinary');

const updateProfile = async (req, res) => {
  try {
    const { name, image } = req.body;
    const userId = req.userId;

    let imageUrl = image;

    // If image is base64, upload to Cloudinary
    if (image && image.startsWith('data:image')) {
      const uploadResponse = await cloudinary.uploader.upload(image, {
        folder: 'chat_avatars',
        transformation: [
          { width: 400, height: 400, crop: 'fill' }
        ]
      });
      imageUrl = uploadResponse.secure_url;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { name, image: imageUrl },
      { new: true }
    ).select('-password');

    res.json({
      status: "success",
      user: { id: user._id, name: user.name, email: user.email, image: user.image }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { register, login, updateProfile };
