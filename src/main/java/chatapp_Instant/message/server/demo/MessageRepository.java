package chatapp_Instant.message.server.demo;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {

   // Single pageable version — always use pagination to avoid loading all
   // messages
   @Query("""
         SELECT m FROM Message m
         WHERE ((m.sender.id = :userId AND m.receiver.id = :otherId)
             OR (m.sender.id = :otherId AND m.receiver.id = :userId))
           AND m.deleted = false
         ORDER BY m.timestamp ASC
         """)
   List<Message> findConversation(
         @Param("userId") Long userId,
         @Param("otherId") Long otherId,
         Pageable pageable);

   // Clearer naming — finds messages sent TO receiver that they haven't read yet
   @Query("""
         SELECT m FROM Message m
         WHERE m.sender.id = :senderId
           AND m.receiver.id = :receiverId
           AND m.read = false
           AND m.deleted = false
         ORDER BY m.timestamp ASC
         """)
   List<Message> findUnreadMessages(
         @Param("senderId") Long senderId,
         @Param("receiverId") Long receiverId);

   // Unread count — useful for notification badges in the UI
   @Query("""
         SELECT COUNT(m) FROM Message m
         WHERE m.receiver.id = :receiverId
           AND m.read = false
           AND m.deleted = false
         """)
   long countUnreadMessages(@Param("receiverId") Long receiverId);
}