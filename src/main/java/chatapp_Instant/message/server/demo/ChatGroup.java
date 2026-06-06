package chatapp_Instant.message.server.demo;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "chat_groups")
public class ChatGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50) // ✅ cap group name length
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id", nullable = false)
    @JsonIgnoreProperties({ "password", "hibernateLazyInitializer", "handler" }) // ✅ safe serialization
    private User createdBy;

    @ManyToMany(fetch = FetchType.LAZY) // ✅ LAZY with @JsonIgnoreProperties instead of EAGER
    @JoinTable(name = "group_members", joinColumns = @JoinColumn(name = "group_id"), inverseJoinColumns = @JoinColumn(name = "user_id"))
    @JsonIgnoreProperties({ "password", "hibernateLazyInitializer", "handler" })
    private Set<User> members = new HashSet<>();

    @Column(nullable = false, updatable = false) // ✅ enforced at DB level
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(User createdBy) {
        this.createdBy = createdBy;
    }

    public Set<User> getMembers() {
        return members;
    }

    public void setMembers(Set<User> members) {
        this.members = members;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime t) {
        this.createdAt = t;
    }
}