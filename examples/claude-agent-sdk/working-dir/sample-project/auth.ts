// Simple authentication module with intentional issues for analysis
export interface User {
  id: string;
  email: string;
  password: string; // Potential issue: storing password in plain text
}

export class AuthService {
  private users: User[] = [];

  // Potential issue: synchronous operation, should be async
  login(email: string, password: string): User | null {
    const user = this.users.find((u) => (u.email = email)); // Bug: assignment instead of comparison
    if (user && user.password === password) {
      return user;
    }
    return null;
  }

  // Missing error handling
  register(email: string, password: string): User {
    const user: User = {
      id: Math.random().toString(), // Potential issue: weak ID generation
      email,
      password,
    };
    this.users.push(user);
    return user;
  }
}
