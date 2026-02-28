/**
 * Simple user model implementing IUser interface required by @lumieducation/h5p-server.
 */
class User {
  constructor() {
    this.id = '1';
    this.name = 'H5P User';
    this.email = 'user@example.com';
    this.type = 'local';
    this.canInstallRecommended = true;
    this.canUpdateAndInstallLibraries = true;
    this.canCreateRestricted = true;
  }
}

module.exports = User;
