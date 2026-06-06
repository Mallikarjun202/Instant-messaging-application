package chatapp_Instant.message.server.demo;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@Profile("secure")
public class SecureSecurityConfig {

        private final UserRepository userRepository;

        // ✅ Constructor injection — no @Autowired needed
        public SecureSecurityConfig(UserRepository userRepository) {
                this.userRepository = userRepository;
        }

        @Bean
        public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
                http
                                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                                .csrf(csrf -> csrf.disable())
                                .authorizeHttpRequests(auth -> auth
                                                .requestMatchers(
                                                                "/ws/**", "/css/**", "/js/**",
                                                                "/login.html", "/register.html",
                                                                "/login", "/register")
                                                .permitAll()
                                                .anyRequest().authenticated()) // ✅ /api/me now requires auth
                                .formLogin(form -> form
                                                .loginPage("/login.html")
                                                .loginProcessingUrl("/login")
                                                .defaultSuccessUrl("/index.html", true)
                                                .failureUrl("/login.html?error=true")
                                                .permitAll())
                                .logout(logout -> logout
                                                .logoutUrl("/logout")
                                                .logoutSuccessUrl("/login.html?logout=true")
                                                .permitAll())
                                .sessionManagement(session -> session
                                                .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                                                .maximumSessions(1)); // ✅ one session per user

                return http.build();
        }

        @Bean
        public CorsConfigurationSource corsConfigurationSource() {
                CorsConfiguration config = new CorsConfiguration();
                // ✅ Replace with your actual Render URL before deploying
                config.setAllowedOriginPatterns(List.of(
                                "http://localhost:*",
                                "https://*.onrender.com"));
                config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
                config.setAllowedHeaders(List.of("*"));
                config.setAllowCredentials(true);

                UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
                source.registerCorsConfiguration("/**", config);
                return source;
        }

        @Bean
        public DaoAuthenticationProvider authenticationProvider() {
                DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
                provider.setPasswordEncoder(passwordEncoder());
                provider.setUserDetailsService(username -> userRepository.findByUsername(username)
                                .map(user -> org.springframework.security.core.userdetails.User
                                                .withUsername(user.getUsername())
                                                .password(user.getPassword())
                                                .roles("USER")
                                                .build())
                                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username)));
                return provider;
        }

        @Bean
        public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
                return config.getAuthenticationManager();
        }

        @Bean
        public PasswordEncoder passwordEncoder() {
                return new BCryptPasswordEncoder();
        }
}