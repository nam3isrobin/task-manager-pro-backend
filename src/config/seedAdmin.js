const bcrypt = require('bcryptjs');
const User = require('../models/user.model');

/**
 * Bootstrap and synchronize the single root Super Admin account from .env
 */
async function seedSuperAdmin() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@taskmanagerpro.dev').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminSecretPassword123!';
  const adminName = process.env.ADMIN_NAME || 'Root Administrator';

  try {
    const existingAdmin = await User.findOne({ role: 'admin' });

    if (!existingAdmin) {
      // Create the single admin
      await User.create({
        name: adminName,
        email: adminEmail,
        password: adminPassword, // will be hashed automatically by userSchema pre-save
        role: 'admin',
      });
      console.log(`🔒 [Security Guard] Single Root Admin account initialized: ${adminEmail}`);
    } else {
      // Synchronize credentials with .env
      existingAdmin.name = adminName;
      existingAdmin.email = adminEmail;
      existingAdmin.password = adminPassword; // pre-save hook will re-hash
      await existingAdmin.save();
      console.log(`🔒 [Security Guard] Root Admin credentials synchronized with .env (${adminEmail})`);
    }
  } catch (error) {
    console.error('⚠️ Failed to seed/sync root admin:', error.message);
  }
}

module.exports = seedSuperAdmin;
