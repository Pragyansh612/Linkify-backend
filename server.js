const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { body, validationResult, param } = require('express-validator');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
};

// Dashboard stats endpoint
app.get('/api/owner/dashboard/stats', async (req, res) => {
  try {
    // Get total users
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id, status, created_at');

    if (usersError) throw usersError;

    const totalUsers = allUsers?.length || 0;
    const activeUsers = allUsers?.filter(user => user.status === 'active').length || 0;

    // Get total connections
    const { data: connections, error: connectionsError } = await supabase
      .from('user_follows')
      .select('id');

    if (connectionsError) throw connectionsError;

    const totalConnections = connections?.length || 0;
    const avgConnections = totalUsers > 0 ? Math.round(totalConnections / totalUsers) : 0;

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const newUsers = allUsers?.filter(user => 
      new Date(user.created_at) >= sevenDaysAgo
    ).length || 0;

    const { data: recentConnections } = await supabase
      .from('user_follows')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    const newConnections = recentConnections?.length || 0;

    res.json({
      totalUsers,
      activeUsers,
      totalConnections,
      avgConnections,
      recentActivity: {
        newUsers,
        newConnections
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Updated users endpoint with pagination
app.get('/api/owner/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        phone,
        date_of_birth,
        profile_image_url,
        status,
        unit_number,
        created_at,
        updated_at
      `, { count: 'exact' });

    // Add search filter if provided
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    // Add pagination
    const { data, error, count } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get follower/following counts for each user
    const usersWithCounts = await Promise.all(
      (data || []).map(async (user) => {
        const { data: followers } = await supabase
          .from('user_follows')
          .select('id')
          .eq('following_id', user.id);

        const { data: following } = await supabase
          .from('user_follows')
          .select('id')
          .eq('follower_id', user.id);

        const age = new Date().getFullYear() - new Date(user.date_of_birth).getFullYear();

        return {
          ...user,
          age,
          followers_count: followers?.length || 0,
          following_count: following?.length || 0
        };
      })
    );

    const totalPages = Math.ceil((count || 0) / limit);

    res.json({
      data: usersWithCounts,
      pagination: {
        currentPage: page,
        totalPages,
        total: count || 0,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single user with full details
app.get('/api/owner/users/:id', [
  param('id').isUUID().withMessage('Invalid user ID')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get followers with details
    const { data: followersData } = await supabase
      .from('user_follows')
      .select(`
        created_at,
        users!user_follows_follower_id_fkey (
          id,
          name,
          email,
          profile_image_url,
          unit_number
        )
      `)
      .eq('following_id', id);

    // Get following with details
    const { data: followingData } = await supabase
      .from('user_follows')
      .select(`
        created_at,
        users!user_follows_following_id_fkey (
          id,
          name,
          email,
          profile_image_url,
          unit_number
        )
      `)
      .eq('follower_id', id);

    const age = new Date().getFullYear() - new Date(user.date_of_birth).getFullYear();

    const followers = followersData?.map(f => ({
      ...f.users,
      followed_at: f.created_at
    })) || [];

    const following = followingData?.map(f => ({
      ...f.users,
      followed_at: f.created_at
    })) || [];

    res.json({
      ...user,
      age,
      followers_count: followers.length,
      following_count: following.length,
      followers,
      following
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user
app.post('/api/owner/users', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone is required'),
  body('date_of_birth').isISO8601().toDate().withMessage('Valid date of birth is required'),
  body('profile_image_url').optional().isURL().withMessage('Profile image URL must be valid URL'),
  body('unit_number').optional().trim(),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive')
], handleValidationErrors, async (req, res) => {
  try {
    const { name, email, phone, date_of_birth, profile_image_url, unit_number, status = 'active' } = req.body;

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const { data, error } = await supabase
      .from('users')
      .insert([{
        name,
        email,
        phone,
        date_of_birth,
        profile_image_url,
        unit_number,
        status
      }])
      .select()
      .single();

    if (error) throw error;

    const age = new Date().getFullYear() - new Date(data.date_of_birth).getFullYear();

    res.status(201).json({
      ...data,
      age,
      followers_count: 0,
      following_count: 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user
app.put('/api/owner/users/:id', [
  param('id').isUUID().withMessage('Invalid user ID'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('phone').optional().trim().notEmpty().withMessage('Phone cannot be empty'),
  body('date_of_birth').optional().isISO8601().toDate().withMessage('Valid date of birth is required'),
  body('profile_image_url').optional().isURL().withMessage('Profile image URL must be valid URL'),
  body('unit_number').optional().trim(),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.email) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', updates.email)
        .neq('id', id)
        .single();

      if (existingUser) {
        return res.status(400).json({ error: 'Email already in use by another user' });
      }
    }

    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'User not found' });

    const { data: followers } = await supabase
      .from('user_follows')
      .select('id')
      .eq('following_id', id);

    const { data: following } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', id);

    const age = new Date().getFullYear() - new Date(data.date_of_birth).getFullYear();

    res.json({
      ...data,
      age,
      followers_count: followers?.length || 0,
      following_count: following?.length || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
app.delete('/api/owner/users/:id', [
  param('id').isUUID().withMessage('Invalid user ID')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('id', id)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Delete all follow relationships
    await supabase
      .from('user_follows')
      .delete()
      .or(`follower_id.eq.${id},following_id.eq.${id}`);

    // Delete user
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete users
app.post('/api/owner/users/bulk-delete', [
  body('userIds').isArray().withMessage('userIds must be an array'),
  body('userIds.*').isUUID().withMessage('Each userId must be a valid UUID')
], handleValidationErrors, async (req, res) => {
  try {
    const { userIds } = req.body;

    if (userIds.length === 0) {
      return res.status(400).json({ error: 'No user IDs provided' });
    }

    // Delete all follow relationships for these users
    for (const userId of userIds) {
      await supabase
        .from('user_follows')
        .delete()
        .or(`follower_id.eq.${userId},following_id.eq.${userId}`);
    }

    // Delete users
    const { error } = await supabase
      .from('users')
      .delete()
      .in('id', userIds);

    if (error) throw error;

    res.json({ message: `${userIds.length} users deleted successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Follow user
app.post('/api/owner/users/:id/follow', [
  param('id').isUUID().withMessage('Invalid user ID'),
  body('followingId').isUUID().withMessage('Invalid following user ID')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { followingId } = req.body;

    if (id === followingId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    // Check if both users exist
    const { data: follower } = await supabase
      .from('users')
      .select('id')
      .eq('id', id)
      .single();

    const { data: following } = await supabase
      .from('users')
      .select('id')
      .eq('id', followingId)
      .single();

    if (!follower || !following) {
      return res.status(404).json({ error: 'One or both users not found' });
    }

    // Check if already following
    const { data: existingFollow } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', id)
      .eq('following_id', followingId)
      .single();

    if (existingFollow) {
      return res.status(400).json({ error: 'Already following this user' });
    }

    // Create follow relationship
    const { data, error } = await supabase
      .from('user_follows')
      .insert([{
        follower_id: id,
        following_id: followingId
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: 'Successfully followed user', follow: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unfollow user
app.delete('/api/owner/users/:id/unfollow/:followingId', [
  param('id').isUUID().withMessage('Invalid user ID'),
  param('followingId').isUUID().withMessage('Invalid following user ID')
], handleValidationErrors, async (req, res) => {
  try {
    const { id, followingId } = req.params;

    const { data: existingFollow } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', id)
      .eq('following_id', followingId)
      .single();

    if (!existingFollow) {
      return res.status(404).json({ error: 'Follow relationship not found' });
    }

    const { error } = await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', id)
      .eq('following_id', followingId);

    if (error) throw error;

    res.json({ message: 'Successfully unfollowed user' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search users
app.get('/api/owner/users/search', async (req, res) => {
  try {
    const { q: query, status, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    let supabaseQuery = supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        phone,
        date_of_birth,
        profile_image_url,
        status,
        unit_number,
        created_at,
        updated_at
      `);

    // Add search filter
    if (query) {
      supabaseQuery = supabaseQuery.or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`);
    }

    // Add status filter
    if (status && status !== 'all') {
      supabaseQuery = supabaseQuery.eq('status', status);
    }

    // Add sorting
    supabaseQuery = supabaseQuery.order(sortBy, { ascending: sortOrder === 'asc' });

    const { data, error } = await supabaseQuery;

    if (error) throw error;

    // Add follower/following counts
    const usersWithCounts = await Promise.all(
      (data || []).map(async (user) => {
        const { data: followers } = await supabase
          .from('user_follows')
          .select('id')
          .eq('following_id', user.id);

        const { data: following } = await supabase
          .from('user_follows')
          .select('id')
          .eq('follower_id', user.id);

        const age = new Date().getFullYear() - new Date(user.date_of_birth).getFullYear();

        return {
          ...user,
          age,
          followers_count: followers?.length || 0,
          following_count: following?.length || 0
        };
      })
    );

    res.json(usersWithCounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload profile image
app.post('/api/owner/upload/profile-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check file size (max 5MB)
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size too large. Maximum 5MB allowed.' });
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' });
    }

    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `profile-images/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('user-uploads')  // Make sure this bucket exists
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Upload error:', error);
      return res.status(500).json({ error: 'Upload failed: ' + error.message });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('user-uploads')
      .getPublicUrl(fileName);

    res.json({ url: publicUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;