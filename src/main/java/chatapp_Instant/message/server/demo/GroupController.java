package chatapp_Instant.message.server.demo;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.*;

@RestController
public class GroupController {

    private final SimpMessagingTemplate messagingTemplate;
    private final GroupRepository groupRepository;
    private final GroupMessageRepository groupMessageRepository;
    private final UserRepository userRepository;

    // ✅ Constructor injection
    public GroupController(SimpMessagingTemplate messagingTemplate,
            GroupRepository groupRepository,
            GroupMessageRepository groupMessageRepository,
            UserRepository userRepository) {
        this.messagingTemplate = messagingTemplate;
        this.groupRepository = groupRepository;
        this.groupMessageRepository = groupMessageRepository;
        this.userRepository = userRepository;
    }

    // ── DTOs ────────────────────────────────────────────────────────

    public static class CreateGroupRequest {
        private String name;
        private List<Long> memberIds;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public List<Long> getMemberIds() {
            return memberIds;
        }

        public void setMemberIds(List<Long> memberIds) {
            this.memberIds = memberIds;
        }
    }

    public static class GroupMessageDTO {
        private Long groupId;
        private String content;

        public Long getGroupId() {
            return groupId;
        }

        public void setGroupId(Long groupId) {
            this.groupId = groupId;
        }

        public String getContent() {
            return content;
        }

        public void setContent(String content) {
            this.content = content;
        }
    }

    public static class GroupMessagePayload {
        private final Long groupId;
        private final Long senderId;
        private final String senderUsername;
        private final String content;
        private final String timestamp;

        public GroupMessagePayload(GroupMessage saved) {
            this.groupId = saved.getGroup().getId();
            this.senderId = saved.getSender().getId();
            this.senderUsername = saved.getSender().getUsername();
            this.content = saved.getContent();
            this.timestamp = saved.getTimestamp().toString();
        }

        public Long getGroupId() {
            return groupId;
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
    }

    // ── REST endpoints ───────────────────────────────────────────────

    @PostMapping("/api/groups")
    @Transactional
    public ResponseEntity<?> createGroup(@RequestBody CreateGroupRequest req, Principal principal) {
        if (principal == null)
            return ResponseEntity.status(401).body("Not authenticated");

        String name = req.getName() == null ? "" : req.getName().trim();
        if (name.isEmpty())
            return ResponseEntity.badRequest().body("Group name is required");

        // ✅ Match the 50 char limit from ChatGroup.java
        if (name.length() > 50)
            return ResponseEntity.badRequest().body("Group name must be 50 characters or less");

        User me = userRepository.findByUsername(principal.getName()).orElse(null);
        if (me == null)
            return ResponseEntity.status(404).body("User not found");

        ChatGroup group = new ChatGroup();
        group.setName(name);
        group.setCreatedBy(me);

        Set<User> members = new HashSet<>();
        members.add(me);

        if (req.getMemberIds() != null) {
            for (Long id : req.getMemberIds()) {
                // ✅ Cap group size at 50 members
                if (members.size() >= 50)
                    break;
                userRepository.findById(id).ifPresent(members::add);
            }
        }

        group.setMembers(members);
        ChatGroup saved = groupRepository.save(group);

        return ResponseEntity.ok(buildGroupMap(saved, me.getId()));
    }

    @GetMapping("/api/groups")
    @Transactional(readOnly = true)
    public ResponseEntity<?> getMyGroups(Principal principal) {
        if (principal == null)
            return ResponseEntity.status(401).body("Not authenticated");

        User me = userRepository.findByUsername(principal.getName()).orElse(null);
        if (me == null)
            return ResponseEntity.status(404).body("User not found");

        List<Map<String, Object>> result = groupRepository
                .findGroupsByMemberId(me.getId())
                .stream()
                .map(g -> buildGroupMap(g, me.getId()))
                .toList(); // ✅ modern Java

        return ResponseEntity.ok(result);
    }

    @GetMapping("/api/groups/{groupId}/messages")
    @Transactional(readOnly = true)
    public ResponseEntity<?> getGroupHistory(
            @PathVariable Long groupId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            Principal principal) {

        if (principal == null)
            return ResponseEntity.status(401).body("Not authenticated");

        // ✅ Cap page size
        size = Math.min(size, 100);

        User me = userRepository.findByUsername(principal.getName()).orElse(null);
        if (me == null)
            return ResponseEntity.status(404).body("User not found");

        ChatGroup group = groupRepository.findById(groupId).orElse(null);
        if (group == null)
            return ResponseEntity.status(404).body("Group not found");

        boolean isMember = group.getMembers().stream().anyMatch(u -> u.getId().equals(me.getId()));
        if (!isMember)
            return ResponseEntity.status(403).body("Not a member of this group");

        List<Map<String, Object>> messages = groupMessageRepository
                .findByGroupIdOrderByTimestampAsc(groupId, PageRequest.of(page, size))
                .stream()
                .map(m -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("groupId", m.getGroup().getId());
                    map.put("senderId", m.getSender().getId());
                    map.put("senderUsername", m.getSender().getUsername());
                    map.put("content", m.getContent());
                    map.put("timestamp", m.getTimestamp().toString());
                    return map;
                })
                .toList(); // ✅ modern Java

        return ResponseEntity.ok(messages);
    }

    @PostMapping("/api/groups/{groupId}/members/{userId}")
    @Transactional
    public ResponseEntity<?> addMember(
            @PathVariable Long groupId,
            @PathVariable Long userId,
            Principal principal) {

        if (principal == null)
            return ResponseEntity.status(401).body("Not authenticated");

        User me = userRepository.findByUsername(principal.getName()).orElse(null);
        if (me == null)
            return ResponseEntity.status(404).body("User not found");

        ChatGroup group = groupRepository.findById(groupId).orElse(null);
        if (group == null)
            return ResponseEntity.status(404).body("Group not found");

        if (!group.getCreatedBy().getId().equals(me.getId()))
            return ResponseEntity.status(403).body("Only the group creator can add members");

        // ✅ Enforce member cap
        if (group.getMembers().size() >= 50)
            return ResponseEntity.badRequest().body("Group has reached the maximum of 50 members");

        User newMember = userRepository.findById(userId).orElse(null);
        if (newMember == null)
            return ResponseEntity.status(404).body("User not found");

        group.getMembers().add(newMember);
        groupRepository.save(group);

        return ResponseEntity.ok("Member added");
    }

    @DeleteMapping("/api/groups/{groupId}/members/{userId}")
    @Transactional
    public ResponseEntity<?> removeMember(
            @PathVariable Long groupId,
            @PathVariable Long userId,
            Principal principal) {

        if (principal == null)
            return ResponseEntity.status(401).body("Not authenticated");

        User me = userRepository.findByUsername(principal.getName()).orElse(null);
        if (me == null)
            return ResponseEntity.status(404).body("User not found");

        ChatGroup group = groupRepository.findById(groupId).orElse(null);
        if (group == null)
            return ResponseEntity.status(404).body("Group not found");

        if (!group.getCreatedBy().getId().equals(me.getId()))
            return ResponseEntity.status(403).body("Only the group creator can remove members");

        if (me.getId().equals(userId))
            return ResponseEntity.badRequest().body("Creator cannot remove themselves");

        group.getMembers().removeIf(u -> u.getId().equals(userId));
        groupRepository.save(group);

        return ResponseEntity.ok("Member removed");
    }

    // ── WebSocket handler ────────────────────────────────────────────

    @MessageMapping("/group-chat")
    @Transactional
    public void sendGroupMessage(GroupMessageDTO dto, Principal principal) {
        if (principal == null || dto == null || dto.getGroupId() == null)
            return;

        String content = dto.getContent() == null ? "" : dto.getContent().trim();
        if (content.isEmpty())
            return;

        // ✅ Block oversized messages
        if (content.length() > 2000)
            return;

        User sender = userRepository.findByUsername(principal.getName()).orElse(null);
        if (sender == null)
            return;

        ChatGroup group = groupRepository.findById(dto.getGroupId()).orElse(null);
        if (group == null)
            return;

        boolean isMember = group.getMembers().stream()
                .anyMatch(u -> u.getId().equals(sender.getId()));
        if (!isMember)
            return;

        GroupMessage msg = new GroupMessage();
        msg.setGroup(group);
        msg.setSender(sender);
        msg.setContent(content);

        GroupMessage saved = groupMessageRepository.save(msg);
        GroupMessagePayload payload = new GroupMessagePayload(saved);

        for (User member : group.getMembers()) {
            messagingTemplate.convertAndSendToUser(
                    member.getUsername(),
                    "/queue/group-messages",
                    payload);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private Map<String, Object> buildGroupMap(ChatGroup g, Long myId) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", g.getId());
        map.put("name", g.getName());
        map.put("createdById", g.getCreatedBy().getId());
        map.put("isCreator", g.getCreatedBy().getId().equals(myId));
        map.put("memberCount", g.getMembers().size());
        List<Map<String, Object>> memberList = g.getMembers().stream()
                .map(u -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", u.getId());
                    m.put("username", u.getUsername());
                    return m;
                })
                .toList(); // ✅ modern Java
        map.put("members", memberList);
        return map;
    }
}