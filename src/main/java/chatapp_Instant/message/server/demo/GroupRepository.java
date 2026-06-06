package chatapp_Instant.message.server.demo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GroupRepository extends JpaRepository<ChatGroup, Long> {

    @Query("SELECT g FROM ChatGroup g JOIN g.members m WHERE m.id = :userId")
    List<ChatGroup> findGroupsByMemberId(@Param("userId") Long userId);
}