package chatapp_Instant.message.server.demo;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.*;

@RestController
public class MessageController {

    private final SimpMessagingTemplate messagingTemplate;
    private final MessageRepository messageRepository;
    private final MessageReactionRepository reactionRepository;
    private final UserRepository userRepository;

    // Constructor injection
    public MessageController(SimpMessagingTemplate messagingTemplate,
            MessageRepository messageRepository,
            MessageReactionRepository reactionRepository,
            UserRepository userRepository) {
        this.messagingTemplate = messagingTemplate;
        this.messageRepository = messageRepository;
        this.reactionRepository = reactionRepository;
        this.userRepository = userRepository;
    }

    // ── DTOs ────────────────────────────────────────────────────────

    public static class ChatMessageDTO {
        private String content;
        private Long receiverId;

        public String getContent() {
            return content;
        }

        public void setContent(String content) {
            this.content = content;
        }

        public Long getReceiverId() {
            return receiverId;
        }

        public void setReceiverId(Long receiverId) {
            this.receiverId = receiverId;
        }
    }

    public static class ChatMessagePayload {
        private final Long id;
        private final Long senderId;
        private final String senderUsername;
        private final String content;
        private final String timestamp;
        private final boolean read;

        public ChatMessagePayload(Message saved) {
            this.id = saved.getId();
            this.senderId = saved.getSender().getId();
            this.senderUsername = saved.getSender().getUsername();
            this.content = saved.getContent();
            this.timestamp = saved.getTimestamp().toString();
            this.read = saved.isRead();
        }

        public Long getId() {
            return id;
        }

        public Long getSenderId() {
            return senderId;
        }

        public String getSenderUsername() {
            return senderUsername;
        }

        public String getContent() {
            return content;
        }

        public String getTimestamp() {
            return timestamp;
        }

        public boolean isRead() {
            return read;
        }
    }

    // ── REST endpoints ───────────────────────────────────────────────

    @GetMapping("/api/users")
    @Transactional(readOnly = true)
    public ResponseEntity<?> getAllUsers(Principal principal) {
        if (principal == null)
            return ResponseEntity.status(401).body("Not authenticated");

        User me = userRepository.findByUsername(principal.getName()).orElse(null);
        if (me == null)
            return ResponseEntity.status(404).body("Current user not found");

        // Cap at 100 users — prevents loading entire DB
        List<Map<String, Object>> users = userRepository.findAll(PageRequest.of(0, 100))
                .stream()
                .filter(user -> !user.getId().equals(me.getId()))
                .map(user -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", user.getId());
                    map.put("username", user.getUsername());
                    map.put("lastSeen", user.getLastSeen() != null ? user.getLastSeen().toString() : "");
                    return map;
                })
                .toList(); // modern Java, no Collectors.toList()

        return ResponseEntity.ok(users);
    }

    // Replaced full-load with paginated query, just fetch last 1 message
    @GetMapping("/api/messages/{otherId}/last")
    @Transactional(readOnly = true)
    public ResponseEntity<?> getLastMessage(@PathVariable Long otherId, Principal principal) {
        if (principal == null)
            return ResponseEntity.status(401).body("Not authenticated");

        User me = userRepository.findByUsername(principal.getName()).orElse(null);
        if (me == null)
            return ResponseEntity.status(404).body("User not found");

        List<Message> msgs = messageRepository
                .findConversation(me.getId(), otherId, PageRequest.of(0, 1));

        if (msgs.isEmpty())
            return ResponseEntity.ok(null);

        Message last = msgs.get(0);
        Map<String, Object> map = new HashMap<>();
        map.put("id", last.getId());
        map.put("senderId", last.getSender().getId());
        map.put("senderUsername", last.getSender().getUsername());
        map.put("content", last.getContent());
        map.put("timestamp", last.getTimestamp().toString());
        map.put("read", last.isRead());
        return ResponseEntity.ok(map);
    }

    @GetMapping("/api/messages/{otherId}")
    @Transactional(readOnly = true)
    public ResponseEntity<?> getHistory(
            @PathVariable Long otherId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            Principal principal) {

        if (principal == null)
            return ResponseEntity.status(401).body("Not authenticated");

        // Cap page size to prevent abuse
        size = Math.min(size, 100);

        User me = userRepository.findByUsername(principal.getName()).orElse(null);
        if (me == null)
            return ResponseEntity.status(404).body("Current user not found");

        List<Map<String, Object>> history = messageRepository
                .findConversation(me.getId(), otherId, PageRequest.of(page, size))
                .stream()
                .map(message -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", message.getId());
                    map.put("senderId", message.getSender().getId());
                    map.put("senderUsername", message.getSender().getUsername());
                    map.put("content", message.getContent());
                    map.put("timestamp", message.getTimestamp().toString());
                    map.put("read", message.isRead());
                    return map;
                })
                .toList();

        return ResponseEntity.ok(history);
    }

    // ── Reaction DTOs ────────────────────────────────────────────────

    public static class ReactionDTO {
        private Long messageId;
        private String emoji;

        public Long getMessageId() {
            return messageId;
        }

        public void setMessageId(Long messageId) {
            this.messageId = messageId;
        }

        public String getEmoji() {
            return emoji;
        }

        public void setEmoji(String emoji) {
            this.emoji = emoji;
        }
    }

    public static class ReactionPayload {
        private final Long messageId;
        private final String emoji;
        private final Long userId;
        private final String action;

        public ReactionPayload(Long messageId, String emoji, Long userId, String action) {
            this.messageId = messageId;
            this.emoji = emoji;
            this.userId = userId;
            this.action = action;
        }

        public Long getMessageId() {
            return messageId;
        }

        public String getEmoji() {
            return emoji;
        }

        public Long getUserId() {
            return userId;
        }

        public String getAction() {
            return action;
        }
    }

    @GetMapping("/api/messages/{messageId}/reactions")
    @Transactional(readOnly = true)
    public ResponseEntity<?> getReactions(@PathVariable Long messageId, Principal principal) {
        if (principal == null)
            return ResponseEntity.status(401).body("Not authenticated");

        List<MessageReaction> reactions = reactionRepository.findByMessageId(messageId);
        Map<String, Object> result = new LinkedHashMap<>();
        reactions.forEach(r -> {
            String emoji = r.getEmoji();
            @SuppressWarnings("unchecked")
            Map<String, Object> group = (Map<String, Object>) result.computeIfAbsent(emoji, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("emoji", k);
                m.put("count", 0);
                m.put("userIds", new ArrayList<Long>());
                return m;
            });
            group.put("count", (int) group.get("count") + 1);
            ((List<Long>) group.get("userIds")).add(r.getUser().getId());
        });
        return ResponseEntity.ok(result.values());
    }

    @PostMapping("/api/messages/{messageId}/reactions")
    @Transactional
    public ResponseEntity<?> toggleReaction(
            @PathVariable Long messageId,
            @RequestBody ReactionDTO dto,
            Principal principal) {

        if (principal == null)
            return ResponseEntity.status(401).body("Not authenticated");

        String emoji = dto.getEmoji() == null ? "" : dto.getEmoji().trim();
        if (emoji.isEmpty())
            return ResponseEntity.badRequest().body("Emoji required");

        // Basic emoji validation — max 10 chars to block malicious strings
        if (emoji.length() > 10)
            return ResponseEntity.badRequest().body("Invalid emoji");

        User me = userRepository.findByUsername(principal.getName()).orElse(null);
        if (me == null)
            return ResponseEntity.status(404).body("User not found");

        Message message = messageRepository.findById(messageId).orElse(null);
        if (message == null)
            return ResponseEntity.status(404).body("Message not found");

        String action;
        var existing = reactionRepository.findByMessageIdAndUserIdAndEmoji(messageId, me.getId(), emoji);
        if (existing.isPresent()) {
            reactionRepository.deleteByMessageIdAndUserIdAndEmoji(messageId, me.getId(), emoji);
            action = "remove";
        } else {
            MessageReaction reaction = new MessageReaction();
            reaction.setMessage(message);
            reaction.setUser(me);
            reaction.setEmoji(emoji);
            reactionRepository.save(reaction);
            action = "add";
        }

        ReactionPayload payload = new ReactionPayload(messageId, emoji, me.getId(), action);
        User other = message.getSender().getId().equals(me.getId())
                ? message.getReceiver()
                : message.getSender();

        messagingTemplate.convertAndSendToUser(me.getUsername(), "/queue/reactions", payload);
        messagingTemplate.convertAndSendToUser(other.getUsername(), "/queue/reactions", payload);

        return ResponseEntity.ok(action);
    }

    // ── Read receipts ────────────────────────────────────────────────

    public static class ReadReceiptPayload {
        private final Long readerId;
        private final Long senderId;

        public ReadReceiptPayload(Long readerId, Long senderId) {
            this.readerId = readerId;
            this.senderId = senderId;
        }

        public Long getReaderId() {
            return readerId;
        }

        public Long getSenderId() {
            return senderId;
        }
    }

    @PostMapping("/api/messages/{otherId}/read")
    @Transactional
    public ResponseEntity<?> markAsRead(@PathVariable Long otherId, Principal principal) {
        if (principal == null)
            return ResponseEntity.status(401).body("Not authenticated");

        User me = userRepository.findByUsername(principal.getName()).orElse(null);
        if (me == null)
            return ResponseEntity.status(404).body("User not found");

        List<Message> unread = messageRepository.findUnreadMessages(otherId, me.getId());
        unread.forEach(m -> m.setRead(true));
        messageRepository.saveAll(unread);

        User other = userRepository.findById(otherId).orElse(null);
        if (other != null && !unread.isEmpty()) {
            ReadReceiptPayload receipt = new ReadReceiptPayload(me.getId(), otherId);
            messagingTemplate.convertAndSendToUser(other.getUsername(), "/queue/read-receipts", receipt);
        }

        return ResponseEntity.ok("Marked as read");
    }

    // ── WebSocket handlers ───────────────────────────────────────────

    @MessageMapping("/chat")
    public void sendMessage(ChatMessageDTO dto, Principal principal) {
        if (principal == null || dto == null || dto.getReceiverId() == null)
            return;

        String content = dto.getContent() == null ? "" : dto.getContent().trim();
        if (content.isEmpty())
            return;

        // Block empty or oversized messages
        if (content.length() > 2000)
            return;

        User sender = userRepository.findByUsername(principal.getName()).orElse(null);
        if (sender == null)
            return;

        User receiver = userRepository.findById(dto.getReceiverId()).orElse(null);
        if (receiver == null)
            return;

        // Block messaging yourself
        if (sender.getId().equals(receiver.getId()))
            return;

        Message message = new Message();
        message.setSender(sender);
        message.setReceiver(receiver);
        message.setContent(content);
        message.setDelivered(true);

        Message saved = messageRepository.save(message);

        sender.setLastSeen(LocalDateTime.now());
        userRepository.save(sender);

        ChatMessagePayload payload = new ChatMessagePayload(saved);
        messagingTemplate.convertAndSendToUser(receiver.getUsername(), "/queue/messages", payload);
        messagingTemplate.convertAndSendToUser(sender.getUsername(), "/queue/messages", payload);
    }

    @MessageMapping("/ping")
    public void ping(Principal principal) {
        if (principal == null)
            return;
        userRepository.findByUsername(principal.getName()).ifPresent(user -> {
            user.setLastSeen(LocalDateTime.now());
            userRepository.save(user);
        });
    }
}