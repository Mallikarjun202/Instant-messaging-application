package chatapp_Instant.message.server.demo;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
public class TypingController { //

    private final SimpMessagingTemplate messagingTemplate;
    private final UserRepository userRepository;
    private final GroupRepository groupRepository;

    // Constructor injection
    public TypingController(SimpMessagingTemplate messagingTemplate,
            UserRepository userRepository,
            GroupRepository groupRepository) {
        this.messagingTemplate = messagingTemplate;
        this.userRepository = userRepository;
        this.groupRepository = groupRepository;
    }

    public static class TypingDTO {
        private Long targetId; // userId for DM, null for group
        private Long groupId; // groupId for group, null for DM

        // Removed username field — always derived from principal, never trusted from
        // client

        public Long getTargetId() {
            return targetId;
        }

        public void setTargetId(Long targetId) {
            this.targetId = targetId;
        }

        public Long getGroupId() {
            return groupId;
        }

        public void setGroupId(Long groupId) {
            this.groupId = groupId;
        }
    }

    // Separate payload so username is set server-side only
    public static class TypingPayload {
        private final String username;
        private final Long targetId;
        private final Long groupId;

        public TypingPayload(String username, Long targetId, Long groupId) {
            this.username = username;
            this.targetId = targetId;
            this.groupId = groupId;
        }

        public String getUsername() {
            return username;
        }

        public Long getTargetId() {
            return targetId;
        }

        public Long getGroupId() {
            return groupId;
        }
    }

    @MessageMapping("/typing")
    public void typing(TypingDTO dto, Principal principal) {
        if (principal == null || dto == null)
            return;

        //  Server always sets the username — never trust the client
        TypingPayload payload = new TypingPayload(
                principal.getName(), dto.getTargetId(), dto.getGroupId());

        if (dto.getGroupId() != null) {
            //  Verify group exists before broadcasting
            groupRepository.findById(dto.getGroupId()).ifPresent(group -> group.getMembers().forEach(member -> {
                if (!member.getUsername().equals(principal.getName())) {
                    messagingTemplate.convertAndSendToUser(
                            member.getUsername(), "/queue/typing", payload);
                }
            }));
        } else if (dto.getTargetId() != null) {
            // Verify target user exists before sending
            userRepository.findById(dto.getTargetId()).ifPresent(target -> messagingTemplate.convertAndSendToUser(
                    target.getUsername(), "/queue/typing", payload));
        }
    }
}