package chatapp_Instant.message.server.demo;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    // Constructor injection
    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @PostMapping("/register")
    public ResponseEntity<String> register(
            @RequestParam String username,
            @RequestParam String password) {

        String cleanUsername = username == null ? "" : username.trim();
        String cleanPassword = password == null ? "" : password.trim();

        if (cleanUsername.isEmpty()) {
            return ResponseEntity.badRequest().body("Username is required");
        }

        // Length validation
        if (cleanUsername.length() < 3 || cleanUsername.length() > 30) {
            return ResponseEntity.badRequest().body("Username must be between 3 and 30 characters");
        }

        if (cleanPassword.isEmpty()) {
            return ResponseEntity.badRequest().body("Password is required");
        }

        // Password strength check
        if (cleanPassword.length() < 6) {
            return ResponseEntity.badRequest().body("Password must be at least 6 characters");
        }

        if (userRepository.findByUsername(cleanUsername).isPresent()) {
            return ResponseEntity.badRequest().body("Username already exists");
        }

        User user = new User();
        user.setUsername(cleanUsername);
        user.setPassword(passwordEncoder.encode(cleanPassword));
        userRepository.save(user);

        return ResponseEntity.ok("User registered successfully");
    }

    // Added /api/me endpoint — tells frontend who is logged in
    @GetMapping("/api/me")
    public ResponseEntity<?> getCurrentUser(@AuthenticationPrincipal UserDetails userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(401).body("Not authenticated");
        }
        return ResponseEntity.ok(Map.of("username", userDetails.getUsername()));
    }
}